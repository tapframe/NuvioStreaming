import { mmkvStorage } from './mmkvStorage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// --- Configuration ---
// Dev: Uses Mac's LAN IP for physical device testing (run: ipconfig getifaddr en0)
// Prod: Uses EXPO_PUBLIC_CAMPAIGN_API_URL from .env
const CAMPAIGN_API_URL = __DEV__
    ? 'http://192.168.1.5:3000'
    : Constants.expoConfig?.extra?.CAMPAIGN_API_URL || process.env.EXPO_PUBLIC_CAMPAIGN_API_URL || '';

// --- Types ---

export type CampaignAction = {
    type: 'link' | 'navigate' | 'dismiss';
    value?: string; // URL or Route Name
    label: string;
    style?: 'primary' | 'secondary' | 'outline';
};

export type CampaignContent = {
    title?: string;
    message?: string;
    imageUrl?: string;
    backgroundColor?: string;
    textColor?: string;
    closeButtonColor?: string;
    primaryAction?: CampaignAction | null;
    secondaryAction?: CampaignAction | null;
    aspectRatio?: number;
};

export type CampaignRules = {
    startDate?: string;
    endDate?: string;
    maxImpressions?: number | null;
    minVersion?: string;
    maxVersion?: string;
    platforms?: string[];
    priority: number;
    showOncePerSession?: boolean;
    showOncePerUser?: boolean;
};

export type Campaign = {
    id: string;
    type: 'poster_modal' | 'banner' | 'bottom_sheet';
    content: CampaignContent;
    rules: CampaignRules;
};

// --- Service ---

class CampaignService {
    private sessionImpressions: Set<string>;
    private campaignQueue: Campaign[] = [];
    private currentIndex: number = 0;
    private lastFetch: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor() {
        this.sessionImpressions = new Set();
    }

    /**
     * Fetches all active campaigns and returns the next valid one in the queue.
     */
    async getActiveCampaign(): Promise<Campaign | null> {
        try {
            const now = Date.now();

            // If we have campaigns in queue and cache is still valid, get next valid one
            if (this.campaignQueue.length > 0 && (now - this.lastFetch) < this.CACHE_TTL) {
                return this.getNextValidCampaign();
            }

            // Fetch all campaigns from server
            const platform = Platform.OS;
            const response = await fetch(
                `${CAMPAIGN_API_URL}/api/campaigns/queue?platform=${platform}`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                }
            );

            if (!response.ok) {
                console.warn('[CampaignService] Failed to fetch campaigns:', response.status);
                return null;
            }

            const campaigns = await response.json();

            if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
                this.campaignQueue = [];
                this.currentIndex = 0;
                this.lastFetch = now;
                return null;
            }

            // Resolve relative image URLs
            campaigns.forEach((campaign: Campaign) => {
                if (campaign.content?.imageUrl && campaign.content.imageUrl.startsWith('/')) {
                    campaign.content.imageUrl = `${CAMPAIGN_API_URL}${campaign.content.imageUrl}`;
                }
            });

            this.campaignQueue = campaigns;
            this.currentIndex = 0;
            this.lastFetch = now;

            return this.getNextValidCampaign();
        } catch (error) {
            console.warn('[CampaignService] Error fetching campaigns:', error);
            return null;
        }
    }

    /**
     * Gets the next valid campaign from the queue.
     */
    private getNextValidCampaign(): Campaign | null {
        while (this.currentIndex < this.campaignQueue.length) {
            const campaign = this.campaignQueue[this.currentIndex];
            if (this.isLocallyValid(campaign)) {
                return campaign;
            }
            this.currentIndex++;
        }
        return null;
    }

    /**
     * Moves to the next campaign in the queue and returns it.
     */
    getNextCampaign(): Campaign | null {
        this.currentIndex++;
        return this.getNextValidCampaign();
    }

    /**
     * Validates campaign against local-only rules.
     */
    private isLocallyValid(campaign: Campaign): boolean {
        const { rules } = campaign;

        // Show once per user (persisted forever)
        if (rules.showOncePerUser && this.hasSeenCampaign(campaign.id)) {
            return false;
        }

        // Impression limit check
        if (rules.maxImpressions) {
            const impressionCount = this.getImpressionCount(campaign.id);
            if (impressionCount >= rules.maxImpressions) {
                return false;
            }
        }

        // Session check
        if (rules.showOncePerSession && this.sessionImpressions.has(campaign.id)) {
            return false;
        }

        return true;
    }

    private hasSeenCampaign(campaignId: string): boolean {
        return mmkvStorage.getBoolean(`campaign_seen_${campaignId}`) || false;
    }

    private markCampaignSeen(campaignId: string) {
        mmkvStorage.setBoolean(`campaign_seen_${campaignId}`, true);
    }

    private getImpressionCount(campaignId: string): number {
        return mmkvStorage.getNumber(`campaign_impression_${campaignId}`) || 0;
    }

    recordImpression(campaignId: string, showOncePerUser?: boolean) {
        const current = this.getImpressionCount(campaignId);
        mmkvStorage.setNumber(`campaign_impression_${campaignId}`, current + 1);
        this.sessionImpressions.add(campaignId);

        if (showOncePerUser) {
            this.markCampaignSeen(campaignId);
        }
    }

    async resetCampaigns() {
        this.sessionImpressions.clear();
        this.campaignQueue = [];
        this.currentIndex = 0;
        this.lastFetch = 0;
    }

    clearCache() {
        this.campaignQueue = [];
        this.currentIndex = 0;
        this.lastFetch = 0;
    }

    /**
     * Returns remaining campaigns in queue count.
     */
    getRemainingCount(): number {
        let count = 0;
        for (let i = this.currentIndex; i < this.campaignQueue.length; i++) {
            if (this.isLocallyValid(this.campaignQueue[i])) {
                count++;
            }
        }
        return count;
    }
}

export const campaignService = new CampaignService();
