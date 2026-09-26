/**
 * Minted — webhook da calculadora → planilha Projetos.
 * Implantar: Implantar → Nova implantação → Aplicativo da web
 * Executar como: eu · Quem tem acesso: Qualquer pessoa
 */
var SHEET_ID = "1zTLYjV0DHYYG1OI36FdBoEgLok5eLnPc9nVRxm9NdCQ";
var TAB = "Projetos";

var HEADERS = [
  "Data",
  "Projeto",
  "Link",
  "Parte",
  "Nº parte",
  "Modo",
  "Unidades na prancha",
  "Tempo (h)",
  "Tempo",
  "Calibragem (min)",
  "Peso (g)",
  "Filamento (R$/kg)",
  "Acabamento",
  "Personalizado",
  "Argola",
  "NFC",
  "Embalagem",
  "Custo filamento (R$)",
  "Custo depreciação (R$)",
  "Custo energia (R$)",
  "Folga erro 15% (R$)",
  "Custo extras (R$)",
  "Custo estimado (R$)",
  "Margem %",
  "Margem (R$)",
  "Pintura extra (R$)",
  "Preço a pedir (R$)",
  "Preço unitário (R$)",
  "Lucro (R$)",
  "Negociação confortável (R$)",
  "Negociação piso (R$)",
  "ROI",
  "ROS",
  "Markup"
];

function doGet(e) {
  var fields = fieldsFrom_(e);
  if (fields && (fields.projeto || fields.payload || fields.preco)) {
    try {
      var result = appendRow_(fields);
      return html_("OK " + result.row);
    } catch (err) {
      return html_("ERRO " + err);
    }
  }
  return json_({ ok: true, service: "minted-calc", sheet: SHEET_ID });
}

function doPost(e) {
  try {
    var fields = fieldsFrom_(e);
    var result = appendRow_(fields);
    return json_({ ok: true, row: result.row });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function fieldsFrom_(e) {
  var fields = {};
  var p = (e && e.parameter) || {};
  if (p.payload) {
    try {
      fields = JSON.parse(p.payload);
    } catch (err) {
      fields = p;
    }
  } else if (e && e.postData && e.postData.contents) {
    var raw = e.postData.contents;
    try {
      var data = JSON.parse(raw);
      fields = data.fields || data;
    } catch (err2) {
      fields = p;
    }
  } else {
    fields = p;
  }
  if (fields.fields && typeof fields.fields === "object") fields = fields.fields;
  return fields || {};
}

function html_(text) {
  return HtmlService.createHtmlOutput(text).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function appendRow_(fields) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TAB);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(TAB);
  }
  ensureHeaders_(sheet);
  var row = HEADERS.map(function (h) {
    var key = headerKey_(h);
    var v = fields[key];
    if (v === undefined || v === null || v === "") v = fields[h];
    if (v === undefined || v === null) return "";
    return v;
  });
  sheet.appendRow(row);
  var last = sheet.getLastRow();
  formatRow_(sheet, last);
  return { row: last };
}

function headerKey_(h) {
  var map = {
    "Data": "data",
    "Projeto": "projeto",
    "Link": "link",
    "Parte": "parte",
    "Nº parte": "nParte",
    "Modo": "modo",
    "Unidades na prancha": "unidades",
    "Tempo (h)": "tempoH",
    "Tempo": "tempo",
    "Calibragem (min)": "calibragemMin",
    "Peso (g)": "pesoG",
    "Filamento (R$/kg)": "filamentoKg",
    "Acabamento": "acabamento",
    "Personalizado": "personalizado",
    "Argola": "argola",
    "NFC": "nfc",
    "Embalagem": "embalagem",
    "Custo filamento (R$)": "custoFilamento",
    "Custo depreciação (R$)": "custoDepreciacao",
    "Custo energia (R$)": "custoEnergia",
    "Folga erro 15% (R$)": "custoErro",
    "Custo extras (R$)": "custoExtras",
    "Custo estimado (R$)": "custo",
    "Margem %": "margemPct",
    "Margem (R$)": "margemReais",
    "Pintura extra (R$)": "pinturaExtra",
    "Preço a pedir (R$)": "preco",
    "Preço unitário (R$)": "precoUn",
    "Lucro (R$)": "lucro",
    "Negociação confortável (R$)": "negoOk",
    "Negociação piso (R$)": "negoPiso",
    "ROI": "roi",
    "ROS": "ros",
    "Markup": "markup"
  };
  return map[h] || h;
}

function ensureHeaders_(sheet) {
  var width = HEADERS.length;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, width).setValues([HEADERS]);
    styleHeader_(sheet, width);
    return;
  }
  var existing = sheet.getRange(1, 1, 1, Math.max(width, sheet.getLastColumn())).getValues()[0];
  var same = HEADERS.every(function (h, i) { return existing[i] === h; });
  if (!same) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, width).setValues([HEADERS]);
    styleHeader_(sheet, width);
  }
}

function styleHeader_(sheet, width) {
  var range = sheet.getRange(1, 1, 1, width);
  range.setFontWeight("bold");
  range.setBackground("#0d1b2a");
  range.setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  try {
    sheet.autoResizeColumns(1, width);
  } catch (e) {}
}

function formatRow_(sheet, row) {
  var moneyCols = [12, 15, 16, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31];
  var pctCols = [24, 32, 33, 34];
  moneyCols.forEach(function (c) {
    sheet.getRange(row, c).setNumberFormat('"R$" #,##0.00');
  });
  pctCols.forEach(function (c) {
    sheet.getRange(row, c).setNumberFormat("0.0%");
  });
  sheet.getRange(row, 8).setNumberFormat("0.00");
  sheet.getRange(row, 11).setNumberFormat("0.0");
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
