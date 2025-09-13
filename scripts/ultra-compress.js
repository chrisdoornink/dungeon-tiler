const fs = require('fs').promises;
const path = require('path');

// Ultra-aggressive compression for small pixelated assets
const compressImage = async (inputPath, outputPath) => {
  try {
    const imagemin = (await import('imagemin')).default;
    const imageminPngquant = (await import('imagemin-pngquant')).default;
    
    const result = await imagemin([inputPath], {
      destination: path.dirname(outputPath),
      plugins: [
        imageminPngquant({
          quality: [0.1, 0.3], // Extremely low quality for pixel art
          speed: 1, // Slowest but best compression
          strip: true, // Remove metadata
          dithering: 1.0, // Maximum dithering for pixel art
          posterize: 2, // Reduce color palette aggressively
        })
      ]
    });
    
    if (result && result.length > 0) {
      // Move the compressed file to overwrite the original
      await fs.rename(result[0].destinationPath, outputPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error compressing ${inputPath}:`, error);
    return false;
  }
};

const getFileSizeKB = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return Math.round(stats.size / 1024);
  } catch {
    return 0;
  }
};

const findFilesOverSize = async (dir, minSizeKB = 100) => {
  const files = [];
  
  const scanDir = async (currentDir) => {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.toLowerCase().endsWith('.png')) {
          const sizeKB = await getFileSizeKB(fullPath);
          if (sizeKB >= minSizeKB) {
            files.push({ path: fullPath, sizeKB });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${currentDir}:`, error);
    }
  };
  
  await scanDir(dir);
  return files.sort((a, b) => b.sizeKB - a.sizeKB);
};

const main = async () => {
  const imagesDir = 'public/images';
  
  console.log('🔍 Finding PNG files over 100KB...');
  const largeFiles = await findFilesOverSize(imagesDir, 100);
  
  if (largeFiles.length === 0) {
    console.log('✅ No files over 100KB found!');
    return;
  }
  
  console.log(`📦 Found ${largeFiles.length} files to ultra-compress:`);
  largeFiles.forEach(file => {
    console.log(`  ${file.path} (${file.sizeKB}KB)`);
  });
  
  let totalSavedKB = 0;
  let successCount = 0;
  
  for (const file of largeFiles) {
    const originalSizeKB = file.sizeKB;
    console.log(`\n🔄 Ultra-compressing: ${file.path} (${originalSizeKB}KB)`);
    
    const success = await compressImage(file.path, file.path);
    
    if (success) {
      const newSizeKB = await getFileSizeKB(file.path);
      const savedKB = originalSizeKB - newSizeKB;
      const savedPercent = Math.round((savedKB / originalSizeKB) * 100);
      
      console.log(`✅ ${originalSizeKB}KB → ${newSizeKB}KB (saved ${savedKB}KB, ${savedPercent}%)`);
      totalSavedKB += savedKB;
      successCount++;
    } else {
      console.log(`❌ Failed to compress ${file.path}`);
    }
  }
  
  console.log(`\n🎉 Ultra-compression complete!`);
  console.log(`📊 Processed: ${successCount}/${largeFiles.length} files`);
  console.log(`💾 Total saved: ${totalSavedKB}KB (${Math.round(totalSavedKB / 1024 * 10) / 10}MB)`);
  
  // Show remaining large files
  const remainingLargeFiles = await findFilesOverSize(imagesDir, 100);
  if (remainingLargeFiles.length > 0) {
    console.log(`\n⚠️  ${remainingLargeFiles.length} files still over 100KB:`);
    remainingLargeFiles.slice(0, 10).forEach(file => {
      console.log(`  ${file.path} (${file.sizeKB}KB)`);
    });
    if (remainingLargeFiles.length > 10) {
      console.log(`  ... and ${remainingLargeFiles.length - 10} more`);
    }
  } else {
    console.log(`\n🎯 All files now under 100KB!`);
  }
};

main().catch(console.error);
