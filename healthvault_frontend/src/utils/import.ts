/** Parses a single CSV line into fields, honoring RFC 4180 double-quote escaping */
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
};

/** Reads a CSV File and returns rows as objects keyed by the header row */
export const parseCSVFile = (file: File): Promise<Record<string, string>[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          resolve([]);
          return;
        }
        const headers = parseCsvLine(lines[0]).map((h) => h.trim());
        const rows = lines.slice(1).map((line) => {
          const values = parseCsvLine(line);
          const row: Record<string, string> = {};
          headers.forEach((h, i) => {
            row[h] = (values[i] ?? '').trim();
          });
          return row;
        });
        resolve(rows);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse CSV file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
