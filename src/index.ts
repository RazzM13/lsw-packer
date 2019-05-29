import { Base64 as base64 } from 'js-base64';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import * as fileType from 'file-type';
// import * as istextorbinary from 'istextorbinary';
const istextorbinary: any = require('istextorbinary');
const oust: any = require('oust');

type ResourceURLMap = {
  [key: string]: string[]
}

function encode(path: string, data: ArrayBuffer): string {
  let r = String.fromCharCode.apply(null, data);

  // encode binary data as a Base64-encoded Data URL
  if (istextorbinary.isBinarySync(path, data)) {
    const dataTypeGuess = fileType(data);
    const dataType = dataTypeGuess ? dataTypeGuess.mime : 'application/octet-stream';
    const dataEncoded = base64.btoa(r);
    r = `data:${dataType};base64,${dataEncoded}`;
  }

  return r;
}

function extractScripts($: any) {
  let r: string[];
  r = $('script')
  .toArray()
  .map( (x: any) => (x.attribs.src) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractImages($: any) {
  let r: string[];
  r = $('img')
  .toArray()
  .map( (x: any) => (x.attribs.src) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractLinks($: any) {
  let r: string[];
  r = $('a')
  .toArray()
  .map( (x: any) => (x.attribs.href) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractStylesheets($: any) {
  let r: string[];
  r = $('link[rel="stylesheet"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractImports($: any) {
  let r: string[];
  r = $('link[rel="import"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractPreloads($: any) {
  let r: string[];
  r = $('link[rel="preload"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) )
  .filter( (x: any) => (!!x) );
  return r;
}

function extractIcons($: any) {
  let r: string[] = [];
  let appleIcons = $('link[rel="apple-touch-icon"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) );
  let favIcons = $('link[rel="icon"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) );
  let msIcons = $('\
    meta[name="msapplication-square150x150logo"],\
    meta[name="msapplication-square310x310logo"],\
    meta[name="msapplication-square70x70logo"],\
    meta[name="msapplication-wide310x150logo"],\
    meta[name="msapplication-TileImage"]\
  ')
  .toArray()
  .map( (x: any) => (x.attribs.content) );
  r = r.concat(appleIcons, favIcons, msIcons);
  r = r.filter( (x: any) => (!!x) );
  return r;
}

function extractMiscelaneous($: any) {
  let r: string[] = [];
  let ms = $('meta[name="msapplication-config"]')
  .toArray()
  .map( (x: any) => (x.attribs.content) );
  let humans = $('link[rel="author"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) );
  let manifests = $('link[rel="manifest"]')
  .toArray()
  .map( (x: any) => (x.attribs.href) );
  r = r.concat(ms, humans, manifests);
  r = r.filter( (x) => (!!x) );
  return r;
}

function pack(inFile: string, outFile: string) {
  console.log(`Packing ${inFile} into ${outFile}...`);

  // prepare
  const html = fs.readFileSync(inFile, {encoding: 'utf8'});
  const html$ = cheerio.load(html);

  // discover resource URLs
  console.log('Processing HTML URLs')
  const resourceURLMap: ResourceURLMap = {
    scripts: extractScripts(html$),
    images: extractImages(html$),
    stylesheets: extractStylesheets(html$),
    imports: extractImports(html$),
    preloads: extractPreloads(html$),
    icons: extractIcons(html$),
    links: extractLinks(html$),
    misc: extractMiscelaneous(html$)
  };
  let resourceURLs: string[] = [];
  resourceURLs = resourceURLs.concat.apply(resourceURLs, Object.values(resourceURLMap));
  resourceURLs = resourceURLs.map( (x) => (x.trim()) );
  resourceURLs = resourceURLs.filter( (x) => (x != '') );
  console.log(`- Discovered a total of ${resourceURLs.length} URLs`);
  console.log('-- Scripts:');
  resourceURLMap.scripts.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Images:');
  resourceURLMap.images.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Stylesheets:');
  resourceURLMap.stylesheets.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Imports:');
  resourceURLMap.imports.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Preloads:');
  resourceURLMap.preloads.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Icons:');
  resourceURLMap.icons.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Links:');
  resourceURLMap.links.forEach( (x) => console.log(`--- ${x}`) );
  console.log('-- Misc:');
  resourceURLMap.misc.forEach( (x) => console.log(`--- ${x}`) );

  // filter external URLs
  const internalURLs = resourceURLs.filter( (x) => (!(/^\w+:\/\//.test(x))) );
  console.log(`- Of which, ${internalURLs.length} are viable asset URLs`);
  internalURLs.forEach( (x) => console.log(`-- ${x}`) );
  console.log('- Done.');

  // make the AppCache's assets catalogue
  console.log('Generating the assets catalogue:');
  const appcacheAssets: any = {};
  for (const url of internalURLs) {
    console.log(`- Processing URL: ${url}`);
    const assetPath = path.normalize(url);
    let assetRealPath = path.resolve('./', assetPath);
    try {
      assetRealPath = fs.realpathSync(assetRealPath);
      const assetContents = encode(assetRealPath, fs.readFileSync(assetRealPath));

      // construct catalogue tree from asset path and store asset contents
      const assetPathParts = assetPath.split('/');
      let assetRoot = appcacheAssets;
      let lastAssetRoot;
      let assetPathPart;
      for (assetPathPart of assetPathParts) {
        if (!assetRoot.hasOwnProperty(assetPathPart)) {
          assetRoot[assetPathPart] = {};
        }
        lastAssetRoot = assetRoot;
        assetRoot = assetRoot[assetPathPart];
      }
      lastAssetRoot[assetPathPart] = assetContents;
    }
    catch (e) {
      console.log(`-- Unable to process asset URL "${url}" via local path "${assetRealPath}"!`);
      console.error(e);
    }
  }
  console.log('- Done.')

  // make the AppCache's main
  console.log('Generating the main:')
  let appcacheMain = html;

  // resolve internal resource URLs to asset URLs
  console.log('- Resolving internal URLs to asset URLs:');
  for (const internalURL of internalURLs) {
    console.log(`-- Processing URL: ${internalURL}`);
    const assetURL = path.join('#/assets/', path.normalize(internalURL));
    appcacheMain = appcacheMain.replace(internalURL, '${LSW.App.instance.getAppCacheDataURL(\'' + assetURL + '\')}');
    console.log(`--- Resolved to: ${assetURL}`);
  }
  console.log('- Done.')

  // determine the AppCache's title
  console.log('Generating the title');
  const appcacheTitle = html$('head title').text();
  console.log('- Done.');

  // determine the AppCache's summary
  console.log('Generating the summary');
  const appcacheSummary = html$('head meta[name="description"]').text();
  console.log('- Done.');

  // build the AppCache
  const appcacheType = 'lsw://schemas@LSW/62B6DF144A2A7B65A2CA4BE37C779E372B0D5EBDD0EDC35A58D2F7D0553D3568C54C431EC84D576BC0678466060F1BF5F19E93D4C994754D2A8ADCA61383A869/AppCacheSchema';
  const appcache = {
    metadata: {
      type: appcacheType,
      title: appcacheTitle,
      summary: appcacheSummary,
      permissions: {}
    },
    contents: {
      main: appcacheMain,
      config: {},
      assets: appcacheAssets,
      readme: '',
      license: 'ISC'
    }
  };

  // persist the result
  console.log(`Writing AppCache to file ${outFile}`);
  const appcacheJSON = JSON.stringify(appcache);
  fs.writeFileSync(outFile, appcacheJSON);
  console.log('- Done.');
}

const argv = require('yargs')
.command('pack <in> <out>', 'Packs an HTML-based SPA and it\s resources into an LSW AppCache.',
  {
    'in': {
      alias: 'i',
      describe: 'The input HTML file',
      default: 'index.html'
    },
    'out': {
      alias: 'o',
      describe: 'The output AppCache file',
      default: 'index.appcache'
    },
  },
  (argv: any) => {pack(argv.in as string, argv.out as string)}
)
.demandCommand(1, 'Please provide the desired command!')
.help()
.parse();
