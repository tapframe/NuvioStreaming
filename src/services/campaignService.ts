import { mmkvStorage } from './mmkvStorage';
import { Platform } from 'react-native';

const DEV_URL = '';
const PROD_URL = process.env.EXPO_PUBLIC_CAMPAIGN_API_URL || '';
const CAMPAIGN_API_URL = __DEV__ ? DEV_URL : PROD_URL;

export type CampaignAction = {
    type: 'link' | 'navigate' | 'dismiss';
    value?: string;
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

class CampaignService {
    private sessionImpressions: Set<string>;
    private campaignQueue: Campaign[] = [];
    private currentIndex: number = 0;
    private lastFetch: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000;

    constructor() {
        this.sessionImpressions = new Set();
    }

    async getActiveCampaign(): Promise<Campaign | null> {
        try {
            const now = Date.now();

            if (this.campaignQueue.length > 0 && (now - this.lastFetch) < this.CACHE_TTL) {
                return this.getNextValidCampaign();
            }

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

    getNextCampaign(): Campaign | null {
        this.currentIndex++;
        return this.getNextValidCampaign();
    }

    private isLocallyValid(campaign: Campaign): boolean {
        const { rules } = campaign;

        if (rules.showOncePerUser && this.hasSeenCampaign(campaign.id)) {
            return false;
        }

        if (rules.maxImpressions) {
            const impressionCount = this.getImpressionCount(campaign.id);
            if (impressionCount >= rules.maxImpressions) {
                return false;
            }
        }

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
