# Atualização de 27/11 — o que trocar no Apps Script

Corrige o envio da situação de carga que "não fazia nada", deixa a entrada mais confiável, traz o leitor de PDF para dentro do GSL, tira a aba Escala 5×2, permite mexer em várias pessoas na Equipe e salvar de uma vez, e acrescenta o medidor de desempenho (Configuração › Sistema › Desempenho) e o modo leve automático. Também corrige o nome: Gestão Setor Logística.

## Substituir (abra o arquivo no Apps Script, apague tudo e cole o novo)
- App.html, Index.html, Estilo.html
- Carga.html, CargaEstilo.html
- Codigo.gs, Banco.gs, Carga.gs, Emails.gs

## Criar (botão + no Apps Script, com estes nomes exatos, sem a extensão)
- `Desempenho` — **+ › Script** (cole o Desempenho.gs)
- `LeitorPdf` — **+ › HTML** (cole o LeitorPdf.html)
- `LeitorPdfTrabalhador` — **+ › HTML** (cole o LeitorPdfTrabalhador.html)

## Publicar
Implantar › Gerenciar implantações › lápis (editar) › Versão: **Nova versão** › Implantar.
Mantenha "Executar como: Eu" e "Qualquer pessoa em Bartofil Distribuidora SA".

Se faltar algum arquivo, a faixa amarela "Atualização incompleta" diz qual.
Detalhes: LEIA-ME.md, seção "Entrega de 27/11".
