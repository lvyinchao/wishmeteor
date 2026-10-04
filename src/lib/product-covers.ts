import sources from '../data/product-cover-sources.json' with { type: 'json' };
export interface ProductCoverSource {kind:string;sourcePage:string;sourceImage?:string;capturedAt:string;sha256:string;description?:string}
export const productCoverSources=sources as Record<string,ProductCoverSource>;
export function productCoverLabel(source:ProductCoverSource):string {
  if(source.kind==='official-website-preview')return 'Official website preview';
  if(source.kind==='live-public-interface')return 'Interface screenshot';
  if(source.kind==='official-interface-image')return 'Official interface image';
  if(source.kind==='published-interface-image')return 'Published interface image';
  return 'Official interface preview';
}
