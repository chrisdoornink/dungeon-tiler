#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function compressImages() {
  // Dynamic imports for ES modules
  const { default: imagemin } = await import('imagemin');
  const { default: imageminPngquant } = await import('imagemin-pngquant');
  const { default: imageminMozjpeg } = await import('imagemin-mozjpeg');
  
  const publicImagesDir = path.join(__dirname, '../public/images');
  const backupDir = path.join(__dirname, '../public/images-backup');
  
  console.log('🖼️  Starting image compression...');
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    console.log('📁 Creating backup directory...');
    fs.mkdirSync(backupDir, { recursive: true });
    
    // Copy original images to backup
    await copyDirectory(publicImagesDir, backupDir);
    console.log('✅ Backup created at public/images-backup/');
  }
  
  // Get initial sizes
  const initialSizes = await getDirectorySize(publicImagesDir);
  console.log(`📊 Initial size: ${formatBytes(initialSizes.totalSize)} (${initialSizes.fileCount} files)`);
  
  try {
    // Compress PNG files
    console.log('🔧 Compressing PNG files...');
    const pngFiles = await imagemin([`${publicImagesDir}/**/*.png`], {
      destination: publicImagesDir,
      plugins: [
        imageminPngquant({
          quality: [0.3, 0.6], // More aggressive compression
          speed: 1, // Slower but better compression
          strip: true, // Remove metadata
          dithering: 1 // Add dithering for better quality at lower file sizes
        })
      ]
    });
    console.log(`✅ Compressed ${pngFiles.length} PNG files`);
    
    // Compress JPG files (if any)
    console.log('🔧 Compressing JPG files...');
    const jpgFiles = await imagemin([`${publicImagesDir}/**/*.{jpg,jpeg}`], {
      destination: publicImagesDir,
      plugins: [
        imageminMozjpeg({
          quality: 80,
          progressive: true
        })
      ]
    });
    console.log(`✅ Compressed ${jpgFiles.length} JPG files`);
    
    // Get final sizes
    const finalSizes = await getDirectorySize(publicImagesDir);
    const savedBytes = initialSizes.totalSize - finalSizes.totalSize;
    const savedPercentage = ((savedBytes / initialSizes.totalSize) * 100).toFixed(1);
    
    console.log(`📊 Final size: ${formatBytes(finalSizes.totalSize)} (${finalSizes.fileCount} files)`);
    console.log(`💾 Saved: ${formatBytes(savedBytes)} (${savedPercentage}%)`);
    
    // Show largest files after compression
    console.log('\n📋 Largest files after compression:');
    const largeFiles = await getLargestFiles(publicImagesDir, 10);
    largeFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}: ${formatBytes(file.size)}`);
    });
    
  } catch (error) {
    console.error('❌ Error during compression:', error);
    console.log('💡 Original images are backed up in public/images-backup/');
  }
}

// Optional: Create WebP versions for modern browsers
async function createWebPVersions() {
  // Dynamic import for ES module
  const { default: imagemin } = await import('imagemin');
  const { default: imageminWebp } = await import('imagemin-webp');
  
  const publicImagesDir = path.join(__dirname, '../public/images');
  
  console.log('\n🌐 Creating WebP versions...');
  
  const webpFiles = await imagemin([`${publicImagesDir}/**/*.{png,jpg,jpeg}`], {
    destination: publicImagesDir,
    plugins: [
      imageminWebp({
        quality: 80,
        method: 6 // Compression method (0-6, higher = better compression)
      })
    ]
  });
  
  console.log(`✅ Created ${webpFiles.length} WebP versions`);
}

// Utility functions
async function copyDirectory(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      await copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function getDirectorySize(dirPath) {
  let totalSize = 0;
  let fileCount = 0;
  
  function calculateSize(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        calculateSize(fullPath);
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }
  }
  
  calculateSize(dirPath);
  return { totalSize, fileCount };
}

async function getLargestFiles(dirPath, limit = 10) {
  const files = [];
  
  function collectFiles(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.name.match(/\.(png|jpg|jpeg|webp)$/i)) {
        const stats = fs.statSync(fullPath);
        const relativePath = path.relative(dirPath, fullPath);
        files.push({ name: relativePath, size: stats.size });
      }
    }
  }
  
  collectFiles(dirPath);
  return files.sort((a, b) => b.size - a.size).slice(0, limit);
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
  const args = process.argv.slice(2);
  const createWebP = args.includes('--webp');
  
  await compressImages();
  
  if (createWebP) {
    await createWebPVersions();
  }
  
  console.log('\n🎉 Image compression complete!');
  console.log('💡 Run "npm run compress-images --webp" to also create WebP versions');
  console.log('💡 Original images are backed up in public/images-backup/');
}

main().catch(console.error);
