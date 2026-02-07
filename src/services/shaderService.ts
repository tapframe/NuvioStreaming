import * as FileSystem from 'expo-file-system/legacy';
import { logger } from '../utils/logger';
import { Asset } from 'expo-asset';
import JSZip from 'jszip';

// Local Shader Pack Asset
const SHADER_ZIP = require('../../assets/shaders/shaders_new.zip');

// Key files to verify installation (matches AnymeX zip contents)
const ESSENTIAL_SHADERS = [
  'Anime4K_Clamp_Highlights.glsl',
  'Anime4K_Restore_CNN_M.glsl',
  'Anime4K_Upscale_CNN_x2_M.glsl',
  'FSR.glsl',
];

// Exact profiles from AnymeX
export const SHADER_PROFILES = {
  "MID-END": {
    'Anime4K: Mode A (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode B (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode C (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode A+A (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode B+B (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_Restore_CNN_Soft_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode C+A (Fast)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
  },
  "HIGH-END": {
    'Anime4K: Mode A (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode B (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode C (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode A+A (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode B+B (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Restore_CNN_Soft_VL.glsl',
      'Anime4K_Upscale_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Restore_CNN_Soft_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
    'Anime4K: Mode C+A (HQ)': [
      'Anime4K_Clamp_Highlights.glsl',
      'Anime4K_Upscale_Denoise_CNN_x2_VL.glsl',
      'Anime4K_AutoDownscalePre_x2.glsl',
      'Anime4K_AutoDownscalePre_x4.glsl',
      'Anime4K_Restore_CNN_M.glsl',
      'Anime4K_Upscale_CNN_x2_M.glsl',
    ],
  },
  "CINEMA": {
    'FidelityFX Super Resolution': ['FSR.glsl'],
    'SSimSuperRes': ['SSimSuperRes.glsl'],
  }
};

export type ShaderCategory = keyof typeof SHADER_PROFILES;
export type ShaderMode = string;

class ShaderService {
  private static instance: ShaderService;
  private initialized = false;
  private shaderDir = `${FileSystem.documentDirectory}shaders/`;

  private constructor() {}

  public static getInstance(): ShaderService {
    if (!ShaderService.instance) {
      ShaderService.instance = new ShaderService();
    }
    return ShaderService.instance;
  }

  /**
   * Check if all shaders are already extracted and available
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.shaderDir);
      if (!dirInfo.exists) return false;

      // Check key files
      const results = await Promise.all(
        ESSENTIAL_SHADERS.map(async (filename) => {
          const path = `${this.shaderDir}${filename}`;
          const info = await FileSystem.getInfoAsync(path);
          return info.exists;
        })
      );

      this.initialized = results.every(v => v === true);
      return this.initialized;
    } catch {
      return false;
    }
  }

  /**
   * Initialize service (called on app/player start)
   */
  async initialize(): Promise<void> {
    await this.checkAvailability();
  }

  /**
   * Extract shaders from bundled assets
   */
  async downloadShaders(onProgress?: (progress: number) => void): Promise<boolean> {
    try {
      if (onProgress) onProgress(0.1);
      
      const dirInfo = await FileSystem.getInfoAsync(this.shaderDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.shaderDir, { intermediates: true });
      }

      // 1. Load local asset
      logger.info('[ShaderService] Loading bundled shader pack...');
      const asset = Asset.fromModule(SHADER_ZIP);
      await asset.downloadAsync();
      
      if (onProgress) onProgress(0.3);

      // 2. Read Zip
      const zipContent = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(zipContent, { base64: true });

      if (onProgress) onProgress(0.6);
      logger.info('[ShaderService] Extracting shader files...');

      // 3. Extract Files
      const files = Object.keys(zip.files);
      let extractedCount = 0;

      for (const filename of files) {
        if (!zip.files[filename].dir) {
          const content = await zip.files[filename].async('base64');
          await FileSystem.writeAsStringAsync(
            `${this.shaderDir}${filename}`,
            content,
            { encoding: FileSystem.EncodingType.Base64 }
          );
        }
        extractedCount++;
        if (onProgress) onProgress(0.6 + (extractedCount / files.length) * 0.4);
      }

      this.initialized = true;
      logger.info('[ShaderService] Shaders installed successfully');
      return true;
    } catch (error) {
      logger.error('[ShaderService] Extraction failed', error);
      return false;
    }
  }

  /**
   * Get the MPV configuration string for the selected profile
   */
  getShaderConfig(profileName: string, category: ShaderCategory = 'MID-END'): string {
    if (!this.initialized || profileName === 'none') {
      return "";
    }

    const profileList = SHADER_PROFILES[category] as Record<string, string[]>;
    const shaderNames = profileList[profileName];

    if (!shaderNames) {
        // Fallback checks for other categories if simple name passed
        for (const cat of Object.keys(SHADER_PROFILES)) {
             const list = SHADER_PROFILES[cat as ShaderCategory] as Record<string, string[]>;
             if (list[profileName]) {
                 const cleanDir = this.shaderDir.replace('file://', '');
                 return list[profileName].map(name => `${cleanDir}${name}`).join(':');
             }
        }
        return "";
    }

    // Map filenames to full local paths and join with ':' (MPV separator)
    // IMPORTANT: Strip 'file://' prefix for MPV native path compatibility
    const cleanDir = this.shaderDir.replace('file://', '');
    
    const config = shaderNames
        .map(name => `${cleanDir}${name}`)
        .join(':');
        
    logger.info(`[ShaderService] Generated config for ${profileName}:`, config);
    return config;
  }
}

export const shaderService = ShaderService.getInstance();