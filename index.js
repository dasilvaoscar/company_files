const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse');

function criarDiretorioSeNaoExiste(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function baixarEExtrairZipDFP(url, destFolder) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erro ao baixar o arquivo ZIP: ${response.statusText}`);
  }

  const buffer = await response.buffer();
  const zip = new AdmZip(buffer);
  const zipFileName = path.basename(url);
  const destPath = path.join(destFolder, zipFileName.replace('.zip', '/'));
  criarDiretorioSeNaoExiste(destPath);
  zip.extractAllTo(destPath, true);

  console.log(`DFP extraído para ${destPath}`);
  return destPath;
}

async function processarCSV(caminhoCSV, CNPJ) {
  const comunicados = [];

  const parser = fs
    .createReadStream(caminhoCSV)
    .pipe(parse({ delimiter: ';', columns: true }));

  try {
    for await (const row of parser) {
      if (row['CNPJ_CIA'] === CNPJ) {
        comunicados.push({
          empresa: row['DENOM_CIA'],
          tipo: row['CATEG_DOC'],
          data: row['DT_REFER'],
          descricao: row['DESC_ASSUNTO'],
          link: row['LINK_DOC']
        });
      }
    }
  } catch (err) { }

  return comunicados;
}

async function baixarEExtrairComunicadoZIP(link, nomeEmpresa, destRootFolder, ano) {
  const response = await fetch(link);
  if (!response.ok) {
    console.error(`Erro ao baixar comunicado: ${response.statusText}`);
    return;
  }

  const buffer = await response.buffer();
  const zip = new AdmZip(buffer);
  const empresaPath = path.join(destRootFolder, nomeEmpresa);
  criarDiretorioSeNaoExiste(empresaPath);

  const entries = zip.getEntries();
  let pdfsExtraidos = 0;

  for (const entry of entries) {
    if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.pdf')) {
      const nomeOriginal = path.basename(entry.entryName.replaceAll('.pdf', `_${ano}.pdf`));
      const caminhoFinal = path.join(empresaPath, nomeOriginal);

      const caminhoSeguro = fs.existsSync(caminhoFinal)
        ? path.join(empresaPath, `${Date.now()}_${nomeOriginal}`)
        : caminhoFinal;

      fs.writeFileSync(caminhoSeguro, entry.getData());
      pdfsExtraidos++;
    }
  }

  if (pdfsExtraidos > 0) {
    console.log(`📄 ${ano}: ${pdfsExtraidos} PDF(s) ${link}`);
  } else {
    console.warn(`⚠️ Nenhum PDF encontrado no ZIP: ${link}`);
  }
}

async function baixarComunicadosPorAno(CNPJ, ano) {
  const baseUrl = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/';
  const zipUrl = `${baseUrl}dfp_cia_aberta_${ano}.zip`;
  const pastaDados = path.resolve('./dados');
  const pastaComunicados = path.resolve('./comunicados');

  const todosOsComunicados = []

  criarDiretorioSeNaoExiste(pastaDados);
  criarDiretorioSeNaoExiste(pastaComunicados);

  const pathExtraido = await baixarEExtrairZipDFP(zipUrl, pastaDados);
  const arquivosCSV = fs.readdirSync(pathExtraido).filter(f => f.endsWith('.csv'));

  await Promise.all(arquivosCSV.map(async arquivo => {
    const caminhoCSV = path.join(pathExtraido, arquivo);
    const comunicados = await processarCSV(caminhoCSV, CNPJ);

    if (comunicados?.length > 0) {
      comunicados.map(comunicado => {
        const nomeEmpresa = comunicado.empresa.replace(/[^\w]/g, '_');
        todosOsComunicados.push({ link: comunicado.link, nomeEmpresa, pastaComunicados, ano })
      })
    }
  }))

  console.log(`📬 ${todosOsComunicados.length} comunicado(s) encontrados para ${ano}:`);
  console.log(`📄 Baixando comunicados...\n`)

  await Promise.all(
    todosOsComunicados.map(
      async ({ link, nomeEmpresa, pastaComunicados, ano }) => await baixarEExtrairComunicadoZIP(link, nomeEmpresa, pastaComunicados, ano)
    )
  )
}

const CNPJ = '33.592.510/0001-54';
const anos = ['2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];

(async () => {
  for (const ano of anos) {
    try {
      console.log(`\n📅 Processando ano ${ano}...`);
      await baixarComunicadosPorAno(CNPJ, ano);
    } catch (err) { }
  }
})();
