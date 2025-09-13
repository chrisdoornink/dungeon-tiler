// Background asset loader for non-critical assets
import { ASSET_URLS, CRITICAL_ASSETS } from './assets_manifest';

class BackgroundAssetLoader {
  private static instance: BackgroundAssetLoader;
  private loadedAssets = new Set<string>();
  private isLoading = false;

  static getInstance(): BackgroundAssetLoader {
    if (!BackgroundAssetLoader.instance) {
      BackgroundAssetLoader.instance = new BackgroundAssetLoader();
    }
    return BackgroundAssetLoader.instance;
  }

  /**
   * Start loading remaining assets in the background after critical assets are loaded
   */
  startBackgroundLoading(): void {
    if (this.isLoading || typeof window === 'undefined') return;
    
    this.isLoading = true;
    const remainingAssets = ASSET_URLS.filter(url => !CRITICAL_ASSETS.includes(url));
    
    // Load remaining assets with lower priority
    this.loadAssetsInBackground(remainingAssets);
  }

  private async loadAssetsInBackground(assets: string[]): Promise<void> {
    // Use lower concurrency for background loading to avoid blocking user interactions
    const MAX_CONCURRENCY = 4;
    let idx = 0;

    const loadBatch = async () => {
      while (idx < assets.length) {
        const url = assets[idx++];
        if (this.loadedAssets.has(url)) continue;

        await new Promise<void>((resolve) => {
          // Add small delay to avoid overwhelming the browser
          setTimeout(() => {
            const img = new Image();
            img.decoding = "async";
            img.loading = "lazy";
            
            img.onload = () => {
              this.loadedAssets.add(url);
              resolve();
            };
            
            img.onerror = () => {
              // Still mark as "processed" to avoid retrying
              this.loadedAssets.add(url);
              resolve();
            };
            
            img.src = url;
          }, 50); // Small delay between requests
        });
      }
    };

    // Start multiple workers with lower concurrency
    const workers = Array.from({ length: MAX_CONCURRENCY }, () => loadBatch());
    await Promise.all(workers);
    
    console.log(`Background loaded ${this.loadedAssets.size} additional assets`);
  }

  /**
   * Check if a specific asset has been loaded
   */
  isAssetLoaded(url: string): boolean {
    return this.loadedAssets.has(url) || CRITICAL_ASSETS.includes(url);
  }

  /**
   * Get loading progress for debugging
   */
  getProgress(): { loaded: number; total: number; percentage: number } {
    const total = ASSET_URLS.length;
    const loaded = this.loadedAssets.size + CRITICAL_ASSETS.length;
    return {
      loaded,
      total,
      percentage: Math.round((loaded / total) * 100)
    };
  }
}

export default BackgroundAssetLoader;
