/**
 * ARQUIVOS
 *
 * Anexos vivem no Drive, dentro da pasta que o sistema criou.
 * O usuario nunca ve essa pasta: envia pelo app e baixa pelo app.
 *
 * No banco, a coluna ANEXOS guarda:
 *   - ATIVIDADES: IDs do Drive (ou a URL do PDF da entrega), por virgula;
 *   - MENSAGENS: uma lista JSON com id, nome, tamanho, tipo e url de cada
 *     anexo — assim abrir a conversa nao precisa ir ao Drive por foto.
 * A pasta e organizada por tabela: Anexos/ATIVIDADES/<ID do registro>/
 */

const TAMANHO_MAXIMO_MB = 10;

function pastaAnexos() {
  exigirPorta_();
  const id = prop('ID_PASTA_ANEXOS', '');
  if (!id) throw new Error('A pasta de anexos ainda não foi criada. Instale o sistema primeiro.');
  return DriveApp.getFolderById(id);
}

/** Cria (ou reaproveita) a subpasta do registro. */
function pastaDoRegistro(tabela, idRegistro) {
  const raiz = pastaAnexos();
  const pastaTabela = subpasta(raiz, tabela);
  return subpasta(pastaTabela, idRegistro);
}

function subpasta(pai, nome) {
  const existentes = pai.getFoldersByName(nome);
  return existentes.hasNext() ? existentes.next() : pai.createFolder(nome);
}

/*
 * Grava o arquivo no Drive e devolve os metadados. So o Drive: o banco
 * fica para quem chamou. Separado de anexarArquivo() porque a mensagem
 * com foto grava o arquivo ANTES de existir a linha (e grava a linha uma
 * vez so, ja com nome, tamanho e link do anexo dentro).
 */
function gravarArquivoNoDrive_(usuario, tabela, idRegistro, arquivo) {
  const bytes = Utilities.base64Decode(arquivo.dados);
  const mb = bytes.length / (1024 * 1024);
  if (mb > TAMANHO_MAXIMO_MB) {
    throw new Error('O arquivo tem ' + mb.toFixed(1) + ' MB. O limite por anexo e ' + TAMANHO_MAXIMO_MB + ' MB.');
  }
  const blob = Utilities.newBlob(bytes, arquivo.tipo, higienizarNome(arquivo.nome));
  const gravado = pastaDoRegistro(tabela, idRegistro).createFile(blob);
  gravado.setDescription('Enviado por ' + usuario.email + ' em ' + agoraTexto());
  return descreverArquivo(gravado);
}

/**
 * Recebe o arquivo do navegador em base64 e grava no Drive.
 * Devolve os metadados para a tela mostrar na hora, sem recarregar.
 */
function anexarArquivo(usuario, tabela, idRegistro, arquivo) {
  // O Drive (lento) fica FORA da trava; dentro dela so o ler-e-gravar da
  // coluna. Antes a leitura era feita fora e dois anexos simultaneos no
  // mesmo registro deixavam so um na coluna (o outro ficava orfao no Drive).
  const descricao = gravarArquivoNoDrive_(usuario, tabela, idRegistro, arquivo);

  const listaAnexos = comTrava(function () {
    const registro = obter(tabela, idRegistro);
    if (!registro) throw new Error('Registro ' + idRegistro + ' não encontrado em ' + tabela + '.');
    const nova = colunaComAnexo_(tabela, registro.ANEXOS, descricao);
    atualizar(tabela, idRegistro, { ANEXOS: nova }, usuario.email);
    return nova;
  });

  registrarLog(usuario.email, 'ANEXAR', tabela, idRegistro, descricao.nome);
  // Devolve tambem a coluna ANEXOS ja atualizada: quem chamou tem o registro
  // de ANTES em maos e, sem isto, teria que reler a tabela inteira so para
  // saber a lista nova (ou seguir com uma copia desatualizada).
  descricao.anexosDoRegistro = listaAnexos;
  return descricao;
}

/*
 * A coluna ANEXOS com um anexo a mais, no MESMO formato em que ja estava:
 * lista JSON (mensagens) continua JSON; lista de IDs continua lista de IDs.
 */
function colunaComAnexo_(tabela, valorAtual, descricao) {
  const atual = String(valorAtual || '').trim();
  if (String(tabela).toUpperCase() === 'MENSAGENS' || atual.charAt(0) === '[') {
    const lista = lerAnexos_(atual);
    lista.push(metadadosDoAnexo_(descricao));
    return JSON.stringify(lista);
  }
  const ids = idsDeAnexos(atual);
  ids.push(descricao.id);
  return ids.join(',');
}

/* O que fica gravado de cada anexo de mensagem: o suficiente para mostrar sem ir ao Drive. */
function metadadosDoAnexo_(d) {
  return { id: d.id, nome: d.nome, tamanho: d.tamanho, tipo: d.tipo, url: d.url };
}

/**
 * Metadados dos anexos de um registro, para montar a lista na tela.
 *
 * DESEMPENHO: era uma ida ao Drive POR ANEXO — abrir uma atividade com 25
 * mensagens com foto custava 25 chamadas. Anexo gravado com metadados
 * (mensagem nova) sai direto da planilha; so o formato antigo (so o ID)
 * ainda consulta o Drive, que e o recuo seguro para o que ja existia.
 */
function listarAnexos(valorColuna) {
  return lerAnexos_(valorColuna).map(function (a) {
    if (a.nome && a.url) {
      return { id: a.id, nome: a.nome, tamanho: a.tamanho || '', tipo: a.tipo || '', url: a.url, quebrado: false };
    }
    try {
      return descreverArquivo(DriveApp.getFileById(a.id));
    } catch (e) {
      return { id: a.id, nome: '(arquivo removido do Drive)', tamanho: '', tipo: '', url: '', quebrado: true };
    }
  });
}

function removerAnexo(usuario, tabela, idRegistro, idArquivo) {
  exigirPorta_();
  const alvo = String(idArquivo || '').trim();
  return comTrava(function () {
    const registro = obter(tabela, idRegistro);
    if (!registro) throw new Error('Registro não encontrado.');

    /*
     * SEGURANCA: antes o arquivo ia para a lixeira mesmo quando NAO era
     * anexo deste registro — bastava passar o ID de qualquer arquivo do
     * Drive do dono do script. Agora so sai o que esta na lista.
     */
    const atuais = lerAnexos_(registro.ANEXOS);
    if (!alvo || !atuais.some(function (a) { return a.id === alvo; })) {
      throw new Error('Esse arquivo não é anexo deste registro.');
    }
    const restantes = atuais.filter(function (a) { return a.id !== alvo; });
    const valor = String(registro.ANEXOS || '').trim().charAt(0) === '['
      ? (restantes.length ? JSON.stringify(restantes) : '')
      : restantes.map(function (a) { return a.id; }).join(',');
    atualizar(tabela, idRegistro, { ANEXOS: valor }, usuario.email);

    try { DriveApp.getFileById(alvo).setTrashed(true); } catch (e) { /* ja sumiu */ }
    registrarLog(usuario.email, 'REMOVER ANEXO', tabela, idRegistro, alvo);
    return { ok: true };
  });
}

/**
 * Devolve o arquivo em base64 para o navegador baixar.
 * O download passa pelo app: quem nao tem permissao na tela nao baixa.
 */
function baixarAnexo(idArquivo) {
  exigirPorta_();
  const arquivo = DriveApp.getFileById(idArquivo);
  const blob = arquivo.getBlob();
  return {
    nome: arquivo.getName(),
    tipo: blob.getContentType(),
    dados: Utilities.base64Encode(blob.getBytes())
  };
}

/*
 * Forma UNICA de retorno. Antes o caminho de sucesso devolvia
 * {id,nome,tamanho,tipo} e o de erro {id,nome,tamanho,url,quebrado} —
 * duas formas diferentes para a mesma lista, e a tela nao tinha 'url'
 * quando dava certo.
 */
function descreverArquivo(arquivo) {
  return {
    id: arquivo.getId(),
    nome: arquivo.getName(),
    tamanho: formatarTamanho(arquivo.getSize()),
    tipo: arquivo.getMimeType(),
    url: arquivo.getUrl(),
    quebrado: false
  };
}

/*
 * PDF de entrega: so quem esta na conta da Bartofil abre pelo link.
 *
 * Ia com ANYONE_WITH_LINK — qualquer pessoa com o link (e-mail
 * encaminhado, print de tela) abria o relatorio, e o RSC traz assiduidade
 * de colaborador. Se o dominio recusar (politica do Workspace, conta sem
 * dominio), o arquivo fica com a permissao da pasta: o recuo e para MENOS
 * exposicao, nunca para publico.
 */
function compartilharNoDominio_(arquivo) {
  try {
    arquivo.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    return 'DOMINIO';
  } catch (e) {
    return 'PASTA';
  }
}

/*
 * A coluna ANEXOS nasceu com DOIS formatos e ninguem tratou a diferenca:
 *   - anexarArquivo() grava IDs do Drive separados por virgula;
 *   - acaoFinalizarEntrega() grava a URL do PDF unico.
 * Com isso uma URL virava "1 anexo" e listarAnexos() fazia
 * getFileById('https://...') — a entrega existia e a tela dizia
 * "(arquivo removido do Drive)". Aqui os dois formatos sao normalizados
 * para ID na leitura; nada precisou ser reescrito no banco.
 * O terceiro formato (lista JSON, das mensagens) tambem e lido aqui.
 */
function idDoArquivoDrive(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  if (t.indexOf('http') !== 0) return t;              // ja e um ID
  const porCaminho = t.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (porCaminho) return porCaminho[1];
  const porParametro = t.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  return porParametro ? porParametro[1] : '';
}

/* Os anexos de uma celula como lista de objetos {id, nome?, tamanho?, tipo?, url?}. */
function lerAnexos_(valor) {
  const t = String(valor || '').trim();
  if (!t) return [];
  if (t.charAt(0) === '[') {
    try {
      const lista = JSON.parse(t);
      if (Array.isArray(lista)) {
        return lista.filter(function (a) { return a && a.id; }).map(function (a) {
          return { id: String(a.id), nome: a.nome || '', tamanho: a.tamanho || '', tipo: a.tipo || '', url: a.url || '' };
        });
      }
    } catch (e) { /* nao era JSON de verdade: le como lista simples */ }
  }
  return t.split(',')
    .map(function (s) { return idDoArquivoDrive(s); })
    .filter(function (s) { return s; })
    .map(function (id) { return { id: id }; });
}

function idsDeAnexos(valor) {
  return lerAnexos_(valor).map(function (a) { return a.id; });
}

/** Link para abrir a entrega, seja ela URL gravada, ID do Drive ou lista JSON. */
function urlDeAnexo(valor) {
  const bruto = String(valor || '').trim();
  if (!bruto) return '';
  if (bruto.charAt(0) === '[') {
    const primeiro = lerAnexos_(bruto)[0];
    if (!primeiro) return '';
    return primeiro.url || ('https://drive.google.com/file/d/' + primeiro.id + '/view');
  }
  if (bruto.indexOf('http') === 0) return bruto.split(',')[0].trim();
  const ids = idsDeAnexos(bruto);
  return ids.length ? ('https://drive.google.com/file/d/' + ids[0] + '/view') : '';
}

function higienizarNome(nome) {
  return String(nome || 'arquivo').replace(/[\/\\:*?"<>|]/g, '-').substring(0, 120);
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
