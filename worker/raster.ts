import { initWasm,Resvg } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import font from './fonts/Inter-400.ttf';
import bold from './fonts/Inter-600.ttf';
let ready:Promise<void>|undefined;
export async function rasterize(svg:string):Promise<Uint8Array> {
  ready ??= initWasm(wasm);await ready;
  const renderer=new Resvg(svg,{font:{fontBuffers:[new Uint8Array(font),new Uint8Array(bold)],defaultFontFamily:'Inter'},fitTo:{mode:'width',value:1200}});
  try {const rendered=renderer.render();try{return rendered.asPng().slice();}finally{rendered.free();}}finally{renderer.free();}
}
