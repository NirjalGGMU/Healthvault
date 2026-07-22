/** Escapes a value for a single CSV field per RFC 4180 and prevents CSV Formula Injection */
const csvField = (value: unknown): string => {
  let str = value === null || value === undefined ? '' : String(value);

  // Prevent Excel/Spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  return /[",\n]/.test(str)
    ? `"${str.replace(/"/g, '""')}"`
    : str;
};

const download = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** Downloads an array of flat objects as a CSV file, using the keys of the first row as headers */
export const exportToCSV = (filename: string, rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvField).join(','),
    ...rows.map((row) => headers.map((h) => csvField(row[h])).join(',')),
  ];
  download(filename, lines.join('\n'), 'text/csv;charset=utf-8;');
};

/** Downloads any JSON-serializable data as a pretty-printed .json file */
export const exportToJSON = (filename: string, data: unknown) => {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
};
