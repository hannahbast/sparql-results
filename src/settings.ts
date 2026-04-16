export interface Settings {
  typeAnnotations: boolean;
  langAnnotations: boolean;
  loadImages: boolean;
  shortenIris: boolean;
  limit: number;
}

export function getDefaultSettings(): Settings {
  return {
    typeAnnotations: false,
    langAnnotations: false,
    loadImages: true,
    shortenIris: true,
    limit: 100,
  };
}
