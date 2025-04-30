const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse');

// Função para baixar e extrair um arquivo ZIP
async function baixarEExtrairZip(url, destFolder) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Erro ao baixar o arquivo ZIP: ${response.statusText}`);
  }

  const buffer = await response.buffer();
  const zip = new AdmZip(buffer);
  const zipFileName = path.basename(url);

  // Diretório de destino para extração
  const destPath = path.join(destFolder, zipFileName.replace('.zip', '/'));
  fs.mkdirSync(destPath, { recursive: true });

  // Extrair os arquivos para o destino
  zip.extractAllTo(destPath, true);
  console.log(`Arquivo extraído para ${destPath}`);

  return destPath;
}

// Função para processar os CSV extraídos
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

  if (comunicados.length === 0) {
    console.log(`Nenhum comunicado encontrado para o CNPJ ${CNPJ}.`);
  } else {
    console.log(`Encontrados ${comunicados.length} comunicados para o CNPJ ${CNPJ}:`);
    comunicados.forEach((c) => {
      console.log(`- [${c.data}] ${c.tipo}: ${c.descricao}`);
      console.log(`  📄 ${c.link}`);
    });
  }
}

// Função principal para baixar, extrair e processar os comunicados
async function baixarComunicados(CNPJ, ano) {
  const baseUrl = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/';
  const zipUrl = `${baseUrl}dfp_cia_aberta_${ano}.zip`;
  const destino = path.resolve('./dados');

  // Baixar e extrair o arquivo ZIP
  const extrairPath = await baixarEExtrairZip(zipUrl, destino);

  // Encontrar os arquivos CSV extraídos
  const arquivosCSV = fs.readdirSync(extrairPath).filter(file => file.endsWith('.csv'));

  // Processar cada CSV encontrado
  for (const arquivo of arquivosCSV) {
    const caminhoCSV = path.join(extrairPath, arquivo);
    await processarCSV(caminhoCSV, CNPJ);
  }
}

const CNPJ = '00.000.000/0001-91';
const anos = ['2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024']; // Substitua pelo ano desejado
(async () => {
  await Promise.all(anos.map(async ano => {
    try {
      await baixarComunicados(CNPJ, ano)
    } catch (err) {
      console.error(`Erro ao obter dados de ${ano}`)
    }
  }))
})()
