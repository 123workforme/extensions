import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
    name: "HiveToons",
    description: "Extension that pulls content from hivetoons.org.",
    version: "1.0.4",
    icon: "icon.png",
    language: "en",
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.CHAPTER_PROVIDING,
        SourceIntents.DISCOVER_SECTION_PROVIDING,
        SourceIntents.SEARCH_RESULT_PROVIDING,
    ],
    badges: [],
    developers: [
        {
            name: "NotTh",
        },
    ],
} satisfies ExtensionInfo;
