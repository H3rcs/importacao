/**
 * ARQUIVOS
 *
 * Anexos vivem no Drive, dentro da pasta que o sistema criou.
 * O usuario nunca ve essa pasta: envia pelo app e baixa pelo app.
 *
 * No banco, a coluna ANEXOS guarda so os IDs, separados por virgula.
 * A pasta e organizada por tabela: Anexos/ATIVIDADES/<ID do registro>/
 */

const TAMANHO_MAXIMO_MB = 10;

function pastaAnexos() {
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

/**
 * Recebe o arquivo do navegador em base64 e grava no Drive.
 * Devolve os metadados para a tela mostrar na hora, sem recarregar.
 */
function anexarArquivo(usuario, tabela, idRegistro, arquivo) {
  const bytes = Utilities.base64Decode(arquivo.dados);
  const mb = bytes.length / (1024 * 1024);
  if (mb > TAMANHO_MAXIMO_MB) {
    throw new Error('O arquivo tem ' + mb.toFixed(1) + ' MB. O limite por anexo e ' + TAMANHO_MAXIMO_MB + ' MB.');
  }

  const blob = Utilities.newBlob(bytes, arquivo.tipo, higienizarNome(arquivo.nome));
  const gravado = pastaDoRegistro(tabela, idRegistro).createFile(blob);
  gravado.setDescription('Enviado por ' + usuario.email + ' em ' + agoraTexto());

  const registro = obter(tabela, idRegistro);
  const atuais = idsDeAnexos(registro ? registro.ANEXOS : '');
  atuais.push(gravado.getId());
  const listaAnexos = atuais.join(',');
  atualizar(tabela, idRegistro, { ANEXOS: listaAnexos }, usuario.email);

  registrarLog(usuario.email, 'ANEXAR', tabela, idRegistro, gravado.getName());
  // Devolve tambem a coluna ANEXOS ja atualizada: quem chamou tem o registro
  // de ANTES em maos e, sem isto, teria que reler a tabela inteira so para
  // saber a lista nova (ou seguir com uma copia desatualizada).
  const descricao = descreverArquivo(gravado);
  descricao.anexosDoRegistro = listaAnexos;
  return descricao;
}

/** Metadados dos anexos de um registro, para montar a lista na tela. */
function listarAnexos(valorColuna) {
  return idsDeAnexos(valorColuna).map(function (id) {
    try {
      return descreverArquivo(DriveApp.getFileById(id));
    } catch (e) {
      return { id: id, nome: '(arquivo removido do Drive)', tamanho: '', tipo: '', url: '', quebrado: true };
    }
  });
}

function removerAnexo(usuario, tabela, idRegistro, idArquivo) {
  const registro = obter(tabela, idRegistro);
  if (!registro) throw new Error('Registro não encontrado.');

  const restantes = idsDeAnexos(registro.ANEXOS).filter(function (id) { return id !== idArquivo; });
  atualizar(tabela, idRegistro, { ANEXOS: restantes.join(',') }, usuario.email);

  try { DriveApp.getFileById(idArquivo).setTrashed(true); } catch (e) { /* ja sumiu */ }
  registrarLog(usuario.email, 'REMOVER ANEXO', tabela, idRegistro, idArquivo);
  return { ok: true };
}

/**
 * Devolve o arquivo em base64 para o navegador baixar.
 * O download passa pelo app: quem nao tem permissao na tela nao baixa.
 */
function baixarAnexo(idArquivo) {
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
 * A coluna ANEXOS nasceu com DOIS formatos e ninguem tratou a diferenca:
 *   - anexarArquivo() grava IDs do Drive separados por virgula;
 *   - acaoFinalizarEntrega() grava a URL do PDF unico.
 * Com isso uma URL virava "1 anexo" e listarAnexos() fazia
 * getFileById('https://...') — a entrega existia e a tela dizia
 * "(arquivo removido do Drive)". Aqui os dois formatos sao normalizados
 * para ID na leitura; nada precisou ser reescrito no banco.
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

function idsDeAnexos(valor) {
  return String(valor || '').split(',')
    .map(function (s) { return idDoArquivoDrive(s); })
    .filter(function (s) { return s; });
}

/** Link para abrir a entrega, seja ela URL gravada ou ID do Drive. */
function urlDeAnexo(valor) {
  const bruto = String(valor || '').trim();
  if (!bruto) return '';
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
