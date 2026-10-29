/* Shared CSV, XLSX and PDF downloads for attendance reports. */
(function () {
    const encoder = new TextEncoder();

    function safeText(value) {
        return String(value == null ? "" : value)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
            .replace(/[\r\n]+/g, " ");
    }

    function dateKey(value) {
        const dateString = String(value || "").trim();
        const isoDate = /^(\d{4}-\d{2}-\d{2})/.exec(dateString);
        if (isoDate) return isoDate[1];
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return dateString;
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function csvContent(headers, rows) {
        const quote = value => {
            let text = safeText(value);
            if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        return [headers, ...rows].map(row => row.map(quote).join(",")).join("\r\n");
    }

    function xmlEscape(value) {
        return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }

    function columnName(index) {
        let name = "";
        for (index += 1; index; index = Math.floor((index - 1) / 26)) {
            name = String.fromCharCode(65 + (index - 1) % 26) + name;
        }
        return name;
    }

    function crc32(bytes) {
        let crc = -1;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit += 1) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
        }
        return (crc ^ -1) >>> 0;
    }

    function joinBytes(parts) {
        const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
        let offset = 0;
        for (const part of parts) {
            result.set(part, offset);
            offset += part.length;
        }
        return result;
    }

    function write16(view, offset, value) {
        view.setUint16(offset, value, true);
    }

    function write32(view, offset, value) {
        view.setUint32(offset, value >>> 0, true);
    }

    function zipStore(files) {
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;

        for (const [name, content] of Object.entries(files)) {
            const nameBytes = encoder.encode(name);
            const data = encoder.encode(content);
            const checksum = crc32(data);
            const localHeader = new Uint8Array(30);
            const localView = new DataView(localHeader.buffer);
            write32(localView, 0, 0x04034B50);
            write16(localView, 4, 20);
            write16(localView, 6, 0x0800);
            write16(localView, 8, 0);
            write32(localView, 14, checksum);
            write32(localView, 18, data.length);
            write32(localView, 22, data.length);
            write16(localView, 26, nameBytes.length);
            localParts.push(localHeader, nameBytes, data);

            const centralHeader = new Uint8Array(46);
            const centralView = new DataView(centralHeader.buffer);
            write32(centralView, 0, 0x02014B50);
            write16(centralView, 4, 20);
            write16(centralView, 6, 20);
            write16(centralView, 8, 0x0800);
            write16(centralView, 10, 0);
            write32(centralView, 16, checksum);
            write32(centralView, 20, data.length);
            write32(centralView, 24, data.length);
            write16(centralView, 28, nameBytes.length);
            write32(centralView, 42, localOffset);
            centralParts.push(centralHeader, nameBytes);
            localOffset += localHeader.length + nameBytes.length + data.length;
        }

        const centralDirectory = joinBytes(centralParts);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        write32(endView, 0, 0x06054B50);
        write16(endView, 8, Object.keys(files).length);
        write16(endView, 10, Object.keys(files).length);
        write32(endView, 12, centralDirectory.length);
        write32(endView, 16, localOffset);
        return joinBytes([...localParts, centralDirectory, end]);
    }

    function xlsxBytes(headers, rows) {
        const allRows = [headers, ...rows];
        const sheetRows = allRows.map((row, rowIndex) => {
            const cells = row.map((value, columnIndex) => {
                const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
                if (typeof value === "number" && Number.isFinite(value)) {
                    return `<c r="${ref}"><v>${value}</v></c>`;
                }
                return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
            }).join("");
            return `<row r="${rowIndex + 1}">${cells}</row>`;
        }).join("");

        return zipStore({
            "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
            "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Attendance" sheetId="1" r:id="rId1"/></sheets></workbook>',
            "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
            "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
        });
    }

    function pdfText(value) {
        return safeText(value).normalize("NFKD").replace(/[^\x20-\x7E]/g, "?")
            .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    }

    function pdfBytes(title, headers, rows) {
        const lines = [
            title,
            `Generated ${new Date().toISOString().slice(0, 10)}`,
            "",
            headers.join(" | ")
        ];
        for (const row of rows) {
            const line = row.map(safeText).join(" | ");
            for (let offset = 0; offset < line.length; offset += 110) {
                lines.push(line.slice(offset, offset + 110));
            }
        }

        const pageLines = [];
        for (let index = 0; index < lines.length; index += 48) {
            pageLines.push(lines.slice(index, index + 48));
        }
        const objects = [
            "<< /Type /Catalog /Pages 2 0 R >>",
            `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${pageLines.length} >>`,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        ];

        pageLines.forEach((page, index) => {
            const pageId = 4 + index * 2;
            const contentId = pageId + 1;
            const commands = ["BT", "/F1 9 Tf", "40 800 Td", "12 TL"];
            page.forEach((line, lineIndex) => {
                if (lineIndex) commands.push("T*");
                commands.push(`(${pdfText(line)}) Tj`);
            });
            commands.push("ET");
            const stream = commands.join("\n");
            objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
            objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
        });

        let document = "%PDF-1.4\n";
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(encoder.encode(document).length);
            document += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xrefOffset = encoder.encode(document).length;
        document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach(offset => {
            document += `${String(offset).padStart(10, "0")} 00000 n \n`;
        });
        document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
        return encoder.encode(document);
    }

    function download(format, title, headers, rows, filename) {
        if (!rows.length) {
            window.alert("There are no attendance records to download.");
            return;
        }
        const base = filename || "attendance-report";
        if (format === "csv") {
            downloadBlob(new Blob(["\uFEFF", csvContent(headers, rows)], {
                type: "text/csv;charset=utf-8"
            }), `${base}.csv`);
        } else if (format === "excel") {
            downloadBlob(new Blob([xlsxBytes(headers, rows)], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            }), `${base}.xlsx`);
        } else if (format === "pdf") {
            downloadBlob(new Blob([pdfBytes(title, headers, rows)], {
                type: "application/pdf"
            }), `${base}.pdf`);
        } else {
            throw new Error(`Unsupported attendance export format: ${format}`);
        }
    }

    window.AttendanceExport = { dateKey, download };
})();
