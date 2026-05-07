import ExcelJS from "exceljs";

export interface XlsxSheet {
  name: string;
  data: unknown[][];
  colWidths?: number[];
}

/**
 * Generate and trigger a browser download of an .xlsx file.
 * Replaces the xlsx / SheetJS package (abandoned, unpatched CVEs).
 */
export async function downloadXlsx(sheets: XlsxSheet[], filename: string): Promise<void> {
  const wb = new ExcelJS.Workbook();

  for (const { name, data, colWidths } of sheets) {
    const ws = wb.addWorksheet(name);

    for (const row of data) {
      ws.addRow(row as ExcelJS.CellValue[]);
    }

    if (colWidths) {
      colWidths.forEach((width, i) => {
        ws.getColumn(i + 1).width = width;
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
