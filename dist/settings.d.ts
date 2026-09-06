export interface Settings {
    typeAnnotations: boolean;
    langAnnotations: boolean;
    loadImages: boolean;
    shortenIris: boolean;
    limit: number;
}
export declare function getDefaultSettings(): Settings;
