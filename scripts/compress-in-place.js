#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Target the largest files specifically
const LARGE_FILES = [
  'presentational/wall-up-close.png',
  'enemies/lantern-wisp.png', 
  'enemies/stone-exciter-front.png',
  'enemies/stone-exciter-back.png',
  'enemies/stone-exciter-right.png',
  'items/wall-torch-1.png',
  'items/wall-torch-2.png',
  'items/wall-torch-3.png',
  'door/gold-chain-lock.png'
];

async function compressInPlace() {
  // Dynamic imports for ES modules
  const { default: imagemin } = await import('imagemin');
  const { default: imageminPngquant } = await import('imagemin-pngquant');
  
  const publicImagesDir = path.join(__dirname, '../public/images');
  const tempDir = path.join(__dirname, '../temp-compress');
  
  console.log('🎯 Compressing large assets in place...');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Get initial sizes of target files
  let initialTotalSize = 0;
  const targetFiles = [];
  
  for (const file of LARGE_FILES) {
    const fullPath = path.join(publicImagesDir, file);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      initialTotalSize += stats.size;
      targetFiles.push({ 
        path: fullPath, 
        relativePath: file, 
        initialSize: stats.size,
        directory: path.dirname(fullPath)
      });
      console.log(`📁 ${file}: ${formatBytes(stats.size)}`);
    }
  }
  
  console.log(`📊 Total size of target files: ${formatBytes(initialTotalSize)}`);
  
  try {
    console.log('\n🔧 Applying aggressive compression...');
    
    for (const file of targetFiles) {
      console.log(`   Compressing ${file.relativePath}...`);
      
      // Compress to temp directory
      const compressedFiles = await imagemin([file.path], {
        destination: tempDir,
        plugins: [
          imageminPngquant({
            quality: [0.2, 0.5], // Very aggressive quality reduction
            speed: 1, // Slowest but best compression
            strip: true, // Remove all metadata
            dithering: 1, // Add dithering
            posterize: 2 // Reduce color palette
          })
        ]
      });
      
      // Replace original with compressed version in same location
      if (compressedFiles.length > 0) {
        const compressedBuffer = compressedFiles[0].data;
        fs.writeFileSync(file.path, compressedBuffer);
      }
    }
    
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    // Calculate savings
    let finalTotalSize = 0;
    console.log('\n📊 Compression results:');
    for (const file of targetFiles) {
      if (fs.existsSync(file.path)) {
        const stats = fs.statSync(file.path);
        const saved = file.initialSize - stats.size;
        const savedPct = ((saved / file.initialSize) * 100).toFixed(1);
        finalTotalSize += stats.size;
        
        console.log(`✅ ${file.relativePath}: ${formatBytes(file.initialSize)} → ${formatBytes(stats.size)} (saved ${savedPct}%)`);
      }
    }
    
    const totalSaved = initialTotalSize - finalTotalSize;
    const totalSavedPct = ((totalSaved / initialTotalSize) * 100).toFixed(1);
    
    console.log(`\n📊 Total compression results:`);
    console.log(`   Before: ${formatBytes(initialTotalSize)}`);
    console.log(`   After:  ${formatBytes(finalTotalSize)}`);
    console.log(`   Saved:  ${formatBytes(totalSaved)} (${totalSavedPct}%)`);
    
  } catch (error) {
    console.error('❌ Error during compression:', error);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main execution
async function main() {
  await compressInPlace();
  console.log('\n🎉 In-place compression complete!');
  console.log('💡 All files remain in their original folder structure');
}

main().catch(console.error);
