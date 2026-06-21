import type { JSONObject } from "@paperback/types";

export interface HiveToonsMetadata extends JSONObject {
    page?: number;
    totalCount?: number;
}

export interface HiveToonsPostsResponse {
    posts: HiveToonsPost[];
    novelPosts: HiveToonsPost[];
    totalCount: number;
    novelTotalCount: number;
}

export interface HiveToonsPost {
    id: number;
    slug: string;
    postTitle: string;
    alternativeTitles: string;
    featuredImage: string;
    featuredImageCL: string;
    hot: boolean;
    isNew: boolean;
    seriesStatus: string;
    seriesType: string;
    lastChapterAddedAt: string;
    createdAt: string;
    updatedAt: string;
    isNovel: boolean;
    isPinned: boolean;
    averageRating: number;
    createdby: { name: string };
    genres: HiveToonsGenre[];
    _count: { chapters: number };
    chapters: HiveToonsChapterSummary[];
}

export interface HiveToonsGenre {
    id: number;
    name: string;
    color: string;
}

export interface HiveToonsChapterSummary {
    id: number;
    number: number;
    title: string;
    featuredImage: string;
    slug: string;
    mangaPostId: number;
    createdAt: string;
    updatedAt: string;
    unlockAt: string | null;
    isPermanentlyLocked: boolean;
    isLocked: boolean;
    isPurchased: boolean;
    isAccessible: boolean;
}

export interface HiveToonsChaptersResponse {
    post: {
        chapters: HiveToonsChapterDetail[];
    };
}

export interface HiveToonsChapterDetail {
    id: number;
    slug: string;
    number: number;
    title: string;
    unlockAt: string | null;
    isPermanentlyLocked: boolean;
    isShortLinkLocked: boolean;
    price: number;
    mangaPostId: number;
    createdAt: string;
    updatedAt: string;
    featuredImage: string;
    mangaPost: {
        postTitle: string;
        slug: string;
        featuredImage: string;
    };
    likesCount: number;
    _count: { comments: number };
    chapterPurchased: boolean;
    isLocked: boolean;
    isAccessible: boolean;
}
