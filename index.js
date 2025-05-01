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

  return comunicados;
}

async function baixarEExtrairComunicadoZIP(link, nomeEmpresa, destRootFolder) {
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
      const nomeOriginal = path.basename(entry.entryName);
      const caminhoFinal = path.join(empresaPath, nomeOriginal);

      const caminhoSeguro = fs.existsSync(caminhoFinal)
        ? path.join(empresaPath, `${Date.now()}_${nomeOriginal}`)
        : caminhoFinal;

      fs.writeFileSync(caminhoSeguro, entry.getData());
      pdfsExtraidos++;
    }
  }

  if (pdfsExtraidos > 0) {
    console.log(`📄 ${pdfsExtraidos} PDF(s) salvos em ${empresaPath}`);
  } else {
    console.warn(`⚠️ Nenhum PDF encontrado no ZIP: ${link}`);
  }
}

async function baixarComunicadosPorAno(CNPJ, ano) {
  const baseUrl = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/';
  const zipUrl = `${baseUrl}dfp_cia_aberta_${ano}.zip`;
  const pastaDados = path.resolve('./dados');
  const pastaComunicados = path.resolve('./comunicados');

  criarDiretorioSeNaoExiste(pastaDados);
  criarDiretorioSeNaoExiste(pastaComunicados);

  const pathExtraido = await baixarEExtrairZipDFP(zipUrl, pastaDados);
  const arquivosCSV = fs.readdirSync(pathExtraido).filter(f => f.endsWith('.csv'));

  for (const arquivo of arquivosCSV) {
    const caminhoCSV = path.join(pathExtraido, arquivo);
    const comunicados = await processarCSV(caminhoCSV, CNPJ);

    if (comunicados.length === 0) {
      console.log(`Nenhum comunicado para ${CNPJ} em ${ano}.`);
    } else {
      console.log(`📬 ${comunicados.length} comunicado(s) encontrados para ${ano}:`);

      for (const comunicado of comunicados) {
        const nomeEmpresa = comunicado.empresa.replace(/[^\w]/g, '_');
        await baixarEExtrairComunicadoZIP(comunicado.link, nomeEmpresa, pastaComunicados);
      }
    }
  }
}

const CNPJ = '00.000.000/0001-91';
const anos = ['2020', '2021', '2022', '2023', '2024'];

(async () => {
  for (const ano of anos) {
    try {
      console.log(`\n📅 Processando ano ${ano}...`);
      await baixarComunicadosPorAno(CNPJ, ano);
    } catch (err) {
      console.error(`❌ Erro no ano ${ano}: ${err.message}`);
    }
  }
})();
