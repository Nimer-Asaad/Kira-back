const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { PDFDocument } = require("pdf-lib");

async function testPdf() {
  try {
    // Find the first PDF in uploads/cv
    const cvDir = path.join(__dirname, "uploads", "cv");
    
    if (!fs.existsSync(cvDir)) {
      console.log("❌ CV directory not found");
      return;
    }

    const files = fs.readdirSync(cvDir).filter(f => f.endsWith(".pdf"));
    
    if (files.length === 0) {
      console.log("❌ No PDF files found in uploads/cv");
      return;
    }

    const testFile = files[0];
    console.log(`📄 Testing: ${testFile}`);
    
    const filePath = path.join(cvDir, testFile);
    const buffer = fs.readFileSync(filePath);
    
    console.log(`📦 Original file size: ${buffer.length} bytes`);
    
    // Try to repair PDF using pdf-lib
    console.log(`🔧 Attempting to repair PDF...`);
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const repairedBytes = await pdfDoc.save();
    
    console.log(`✅ PDF repaired, new size: ${repairedBytes.length} bytes`);
    
    // Now try to parse
    const parsed = await pdfParse(repairedBytes);
    
    console.log(`✅ PDF parsed successfully`);
    console.log(`📝 Pages: ${parsed.numpages}`);
    console.log(`📝 Text length: ${parsed.text?.length || 0} characters`);
    console.log(`\n--- First 500 characters ---`);
    console.log(parsed.text?.substring(0, 500));
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testPdf();
