// VPS Turnover → Google Sheet archive.
// Paste into the sheet: Extensions → Apps Script, then Deploy → New deployment → Web app
// (Execute as: Me, Who has access: Anyone). Put the Web app URL into Vercel as SHEETS_WEBHOOK_URL.
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Archived on', 'Property', 'Unit', 'Job type', 'Move-out', 'Due', 'Move-in', 'PO', 'Project code',
      'Section', 'Task', 'Assigned to', 'Done by', 'Done at', 'Notes']);
  }
  var rows = data.rows || [];
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, added: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}
