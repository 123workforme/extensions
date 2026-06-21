import {
    BasicRateLimiter,
    type Chapter,
    type ChapterDetails,
    type ChapterProviding,
    type DiscoverSection,
    type DiscoverSectionItem,
    type DiscoverSectionProviding,
    DiscoverSectionType,
    type Extension,
    type MangaProviding,
    type PagedResults,
    type SearchQuery,
    type SearchResultItem,
    type SearchResultsProviding,
    type SortingOption,
    type SourceManga,
} from "@paperback/types";
import { URLBuilder } from "../utils/url-builder/base";
import { HT_API_DOMAIN, HT_DOMAIN } from "./config";
import { HiveToonsInterceptor } from "./interceptor";
import type {
    HiveToonsChapterDetail,
    HiveToonsChaptersResponse,
    HiveToonsMetadata,
    HiveToonsPost,
    HiveToonsPostsResponse,
} from "./interfaces";
import pbconfig from "./pbconfig";

import * as cheerio from "cheerio";

export class HiveToonsExtension
    implements
        Extension,
        SearchResultsProviding,
        MangaProviding,
        ChapterProviding,
        DiscoverSectionProviding
{
    globalRateLimiter = new BasicRateLimiter("ratelimiter", {
        numberOfRequests: 4,
        bufferInterval: 1,
        ignoreImages: false,
    });

    requestManager = new HiveToonsInterceptor("main");

    async initialise(): Promise<void> {
        this.globalRateLimiter.registerInterceptor();
        this.requestManager.registerInterceptor();
        if (Application.isResourceLimited) return;
    }

    private cachePost(post: HiveToonsPost): void {
        Application.setState(post.slug, `slug_${post.id}`);
        Application.setState(post.id, `id_${post.slug}`);
        Application.setState(JSON.stringify(post), `post_${post.id}`);
    }

    private getCachedSlug(postId: string): string | undefined {
        return Application.getState(`slug_${postId}`) as string | undefined;
    }

    private getCachedPost(postId: string): HiveToonsPost | undefined {
        const raw = Application.getState(`post_${postId}`) as string | undefined;
        if (!raw) return undefined;
        try {
            return JSON.parse(raw) as HiveToonsPost;
        } catch {
            return undefined;
        }
    }

    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return [
            {
                id: "latest_updates",
                title: "Latest Updates",
                type: DiscoverSectionType.chapterUpdates,
            },
            {
                id: "popular",
                title: "Most Popular",
                type: DiscoverSectionType.simpleCarousel,
            },
            {
                id: "genres",
                title: "Genres",
                type: DiscoverSectionType.genres,
            },
        ];
    }

    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: HiveToonsMetadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        let items: DiscoverSectionItem[] = [];
        const page: number = metadata?.page ?? 1;

        switch (section.id) {
            case "latest_updates": {
                const url = new URLBuilder(HT_API_DOMAIN)
                    .addPath("api")
                    .addPath("posts")
                    .addQuery("page", page)
                    .addQuery("per_page", 20)
                    .addQuery("orderBy", "latest")
                    .build();

                const [_, buffer] = await Application.scheduleRequest({
                    url,
                    method: "GET",
                });
                const json: HiveToonsPostsResponse = JSON.parse(
                    Application.arrayBufferToUTF8String(buffer),
                );

                for (const post of json.posts) {
                    if (post.isNovel) continue;
                    this.cachePost(post);
                    const latestChapter = post.chapters[0];
                    items.push({
                        imageUrl: post.featuredImage,
                        title: post.postTitle,
                        mangaId: post.id.toString(),
                        chapterId: latestChapter?.slug ?? "",
                        subtitle: latestChapter
                            ? `Chapter ${latestChapter.number}`
                            : undefined,
                        type: "chapterUpdatesCarouselItem",
                        contentRating: pbconfig.contentRating,
                    });
                }

                const hasMore = page * 20 < json.totalCount;
                metadata = hasMore ? { page: page + 1 } : undefined;
                break;
            }
            case "popular": {
                const url = new URLBuilder(HT_API_DOMAIN)
                    .addPath("api")
                    .addPath("posts")
                    .addQuery("page", page)
                    .addQuery("per_page", 20)
                    .addQuery("orderBy", "popular")
                    .build();

                const [_, buffer] = await Application.scheduleRequest({
                    url,
                    method: "GET",
                });
                const json: HiveToonsPostsResponse = JSON.parse(
                    Application.arrayBufferToUTF8String(buffer),
                );

                for (const post of json.posts) {
                    if (post.isNovel) continue;
                    this.cachePost(post);
                    const latestChapter = post.chapters[0];
                    items.push({
                        imageUrl: post.featuredImage,
                        title: post.postTitle,
                        mangaId: post.id.toString(),
                        subtitle: latestChapter
                            ? `Chapter ${latestChapter.number}`
                            : undefined,
                        type: "simpleCarouselItem",
                        contentRating: pbconfig.contentRating,
                    });
                }

                const hasMore = page * 20 < json.totalCount;
                metadata = hasMore ? { page: page + 1 } : undefined;
                break;
            }
            case "genres": {
                const genres = [
                    "Action",
                    "Drama",
                    "Fantasy",
                    "Comedy",
                    "Shounen",
                    "School Life",
                    "Supernatural",
                    "Mystery",
                    "Adventure",
                    "Gang",
                    "Thriller",
                    "Seinen",
                    "Romance",
                ];
                for (const genre of genres) {
                    items.push({
                        type: "genresCarouselItem",
                        searchQuery: {
                            title: genre,
                        },
                        name: genre,
                        metadata: undefined,
                    });
                }
                metadata = undefined;
                break;
            }
        }

        return { items, metadata };
    }

    getMangaShareUrl(mangaId: string): string {
        const slug = this.getCachedSlug(mangaId) ?? mangaId;
        return `${HT_DOMAIN}/series/${slug}`;
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const post = await this.fetchPost(mangaId);

        if (!post) {
            throw new Error(`Series not found: ${mangaId}`);
        }

        this.cachePost(post);
        const slug = post.slug;

        const altTitles = post.alternativeTitles
            ? post.alternativeTitles
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)
            : [];

        let synopsis = "";
        try {
            const [, pageBuffer] = await Application.scheduleRequest({
                url: `${HT_DOMAIN}/series/${encodeURI(slug)}`,
                method: "GET",
            });
            const html = Application.arrayBufferToUTF8String(pageBuffer);
            const descMatch = html.match(
                /<meta\s+name="description"\s+content="([^"]*)"/,
            );
            if (descMatch?.[1]) {
                synopsis = descMatch[1]
                    .replace(/<[^>]*>/g, "")
                    .replace(/&amp;/g, "&")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&quot;/g, '"')
                    .replace(/&#x27;/g, "'")
                    .replace(/&#39;/g, "'")
                    .trim();
            }
        } catch {
            // Fallback: no synopsis
        }

        return {
            mangaId,
            mangaInfo: {
                primaryTitle: post.postTitle,
                secondaryTitles: altTitles,
                status: this.mapStatus(post.seriesStatus),
                author: post.createdby?.name !== "Admin" ? post.createdby?.name : undefined,
                tagGroups: [
                    {
                        id: "genres",
                        title: "Genres",
                        tags: post.genres.map((g) => ({
                            id: g.name.toLowerCase().replace(/\s/g, "-"),
                            title: g.name,
                        })),
                    },
                ],
                synopsis,
                thumbnailUrl: post.featuredImage,
                contentRating: pbconfig.contentRating,
                shareUrl: `${HT_DOMAIN}/series/${slug}`,
            },
        };
    }

    private async fetchPost(mangaId: string): Promise<HiveToonsPost | undefined> {
        const cached = this.getCachedPost(mangaId);
        if (cached) return cached;

        const postId = Number(mangaId);
        const slug = this.getCachedSlug(mangaId);

        const url = new URLBuilder(HT_API_DOMAIN)
            .addPath("api")
            .addPath("posts")
            .addQuery("page", 1)
            .addQuery("per_page", 50)
            .addQuery("orderBy", "latest")
            .build();

        const [_, buffer] = await Application.scheduleRequest({ url, method: "GET" });
        const json: HiveToonsPostsResponse = JSON.parse(
            Application.arrayBufferToUTF8String(buffer),
        );

        for (const p of json.posts) {
            this.cachePost(p);
            if (p.id === postId || p.slug === slug) return p;
        }

        let page = 2;
        const totalPages = Math.ceil(json.totalCount / 50);
        while (page <= totalPages) {
            const pageUrl = new URLBuilder(HT_API_DOMAIN)
                .addPath("api")
                .addPath("posts")
                .addQuery("page", page)
                .addQuery("per_page", 50)
                .addQuery("orderBy", "latest")
                .build();

            const [, buf] = await Application.scheduleRequest({ url: pageUrl, method: "GET" });
            const pageJson: HiveToonsPostsResponse = JSON.parse(
                Application.arrayBufferToUTF8String(buf),
            );

            for (const p of pageJson.posts) {
                this.cachePost(p);
                if (p.id === postId || p.slug === slug) return p;
            }
            page++;
        }

        return undefined;
    }

    private mapStatus(status: string): string {
        switch (status.toUpperCase()) {
            case "ONGOING":
                return "Ongoing";
            case "COMPLETED":
                return "Completed";
            case "HIATUS":
                return "Hiatus";
            case "DROPPED":
                return "Cancelled";
            default:
                return "Ongoing";
        }
    }

    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        const postId = await this.resolvePostId(sourceManga.mangaId);
        const chapters: Chapter[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const url = new URLBuilder(HT_API_DOMAIN)
                .addPath("api")
                .addPath("chapters")
                .addQuery("postId", postId)
                .addQuery("page", page)
                .addQuery("per_page", 100)
                .build();

            const [_, buffer] = await Application.scheduleRequest({
                url,
                method: "GET",
            });

            const json: HiveToonsChaptersResponse = JSON.parse(
                Application.arrayBufferToUTF8String(buffer),
            );

            if (!json.post?.chapters || json.post.chapters.length === 0) {
                hasMore = false;
                break;
            }

            for (const chapter of json.post.chapters) {
                chapters.push(this.mapChapter(chapter, sourceManga));
            }

            if (json.post.chapters.length < 100) {
                hasMore = false;
            } else {
                page++;
            }
        }

        return chapters;
    }

    private mapChapter(chapter: HiveToonsChapterDetail, sourceManga: SourceManga): Chapter {
        return {
            sourceManga,
            chapterId: chapter.slug,
            langCode: "🇬🇧",
            chapNum: chapter.number,
            title: chapter.title || undefined,
            publishDate: new Date(chapter.createdAt),
            sortingIndex: chapter.number,
            volume: 0,
        };
    }

    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        const slug = await this.resolveSlug(chapter.sourceManga.mangaId);
        const url = `${HT_DOMAIN}/series/${slug}/${chapter.chapterId}`;

        const [_, buffer] = await Application.scheduleRequest({
            url,
            method: "GET",
        });

        const html = Application.arrayBufferToUTF8String(buffer);
        const $ = cheerio.load(html);

        const pages: string[] = [];

        $("img[data-reader-page-image]").each((_, el) => {
            const src = $(el).attr("src") || $(el).attr("data-src") || "";
            if (src && src.startsWith("http")) {
                pages.push(src);
            }
        });

        if (pages.length === 0) {
            const imgRegex = /https:\/\/storage\.hivetoon\.com\/public\/upload\/series\/[^"'\s<>]+/g;
            const matches = html.match(imgRegex) ?? [];
            const seen = new Set<string>();
            for (const match of matches) {
                const clean = match.replace(/&quot;.*$/, "").replace(/&amp;.*$/, "");
                if (!seen.has(clean) && clean.includes("/page-")) {
                    seen.add(clean);
                    pages.push(clean);
                }
            }
        }

        return {
            id: chapter.chapterId,
            mangaId: chapter.sourceManga.mangaId,
            pages,
        };
    }

    async getSearchResults(
        query: SearchQuery<HiveToonsMetadata>,
        metadata: HiveToonsMetadata | undefined,
    ): Promise<PagedResults<SearchResultItem>> {
        const page: number = metadata?.page ?? 1;

        const urlBuilder = new URLBuilder(HT_API_DOMAIN)
            .addPath("api")
            .addPath("posts")
            .addQuery("page", page)
            .addQuery("per_page", 20)
            .addQuery("orderBy", "latest");

        if (query.title) {
            urlBuilder.addQuery("search", query.title);
        }

        const [_, buffer] = await Application.scheduleRequest({
            url: urlBuilder.build(),
            method: "GET",
        });

        const json: HiveToonsPostsResponse = JSON.parse(
            Application.arrayBufferToUTF8String(buffer),
        );

        const items: SearchResultItem[] = [];

        for (const post of json.posts) {
            if (post.isNovel) continue;
            this.cachePost(post);
            const latestChapter = post.chapters[0];
            items.push({
                imageUrl: post.featuredImage,
                title: post.postTitle,
                mangaId: post.id.toString(),
                subtitle: latestChapter
                    ? `Chapter ${latestChapter.number}`
                    : `${post._count.chapters} chapters`,
                contentRating: pbconfig.contentRating,
            });
        }

        const hasMore = page * 20 < json.totalCount;
        metadata = hasMore ? { page: page + 1 } : undefined;
        return { items, metadata };
    }

    async getSortingOptions(): Promise<SortingOption[]> {
        return [
            { id: "latest", label: "Latest Update" },
            { id: "popular", label: "Popular" },
        ];
    }

    private async resolvePostId(mangaId: string): Promise<number> {
        const asNum = Number(mangaId);
        if (!Number.isNaN(asNum) && asNum > 0) return asNum;

        const cached = Application.getState(`id_${mangaId}`) as number | undefined;
        if (cached) return cached;

        const url = new URLBuilder(HT_API_DOMAIN)
            .addPath("api")
            .addPath("posts")
            .addQuery("slug", mangaId)
            .build();

        const [_, buffer] = await Application.scheduleRequest({
            url,
            method: "GET",
        });

        const json: HiveToonsPostsResponse = JSON.parse(
            Application.arrayBufferToUTF8String(buffer),
        );

        const post = json.posts[0];
        if (!post) throw new Error(`Could not resolve post ID for: ${mangaId}`);

        this.cachePost(post);
        return post.id;
    }

    private async resolveSlug(mangaId: string): Promise<string> {
        const cached = this.getCachedSlug(mangaId);
        if (cached) return cached;

        const asNum = Number(mangaId);
        if (!Number.isNaN(asNum) && asNum > 0) {
            const url = new URLBuilder(HT_API_DOMAIN)
                .addPath("api")
                .addPath("chapters")
                .addQuery("postId", asNum)
                .addQuery("page", 1)
                .addQuery("per_page", 1)
                .build();

            const [_, buffer] = await Application.scheduleRequest({
                url,
                method: "GET",
            });

            const json: HiveToonsChaptersResponse = JSON.parse(
                Application.arrayBufferToUTF8String(buffer),
            );

            const slug = json.post?.chapters?.[0]?.mangaPost?.slug;
            if (slug) {
                Application.setState(slug, `slug_${mangaId}`);
                Application.setState(asNum, `id_${slug}`);
                return slug;
            }
        }

        return mangaId;
    }
}

export const HiveToons = new HiveToonsExtension();
