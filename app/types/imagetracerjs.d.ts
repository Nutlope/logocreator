declare module "imagetracerjs" {
  const ImageTracer: {
    imagedataToSVG(
      imgdata: ImageData,
      options?: Record<string, unknown> | string,
    ): string;
    imageToSVG(
      url: string,
      callback: (svg: string) => void,
      options?: Record<string, unknown> | string,
    ): void;
    versionnumber?: string;
  };
  export default ImageTracer;
}
