declare module '@kesha-antonov/react-native-background-downloader' {
    export interface DownloadTask {
        id: string;
        percent: number;
        bytesWritten: number;
        totalBytes: number;
        state: 'DOWNLOADING' | 'PAUSED' | 'DONE' | 'STOPPED' | 'FAILED';
        pause(): void;
        resume(): void;
        stop(): void;
        start(): void;
        begin(handler: (expectedBytes: number) => void): DownloadTask;
        progress(handler: (percent: number, bytesWritten: number, totalBytes: number) => void): DownloadTask;
        done(handler: () => void): DownloadTask;
        error(handler: (error: any) => void): DownloadTask;
    }

    export const directories: {
        documents: string;
    };

    export function download(options: { id: string; url: string; destination: string; headers?: Record<string, string>; metadata?: any }): DownloadTask;
    
    export function checkForExistingDownloads(): Promise<DownloadTask[]>;
    
    // Legacy exports to match library behavior
    export function completeHandler(id: string): void;
    
    export function createDownloadTask(options: { id: string; url: string; destination: string; headers?: Record<string, string>; metadata?: any }): DownloadTask;
    
    export function getExistingDownloadTasks(): Promise<DownloadTask[]>;

    const RNBackgroundDownloader: {
        download(options: { id: string; url: string; destination: string; headers?: Record<string, string>; metadata?: any }): DownloadTask;
        checkForExistingDownloads(): Promise<DownloadTask[]>;
        directories: {
            documents: string;
        };
        completeHandler(id: string): void;
        createDownloadTask(options: { id: string; url: string; destination: string; headers?: Record<string, string>; metadata?: any }): DownloadTask;
        getExistingDownloadTasks(): Promise<DownloadTask[]>;
    };
    
    export default RNBackgroundDownloader;
}
