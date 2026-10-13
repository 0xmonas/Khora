import sharp from 'sharp';
import { createPublicClient, http } from 'viem';
import { shape } from 'viem/chains';

const BOOA = '0x7aecA981734d133d3f695937508C48483BA6b654';
const TOTAL = 3333;
const COLS = 58;
const ROWS = 58;
const CELL = 64;
const SIZE = COLS * CELL;
const BATCH = 5;
const RETRY = 3;
const DELAY = 200;

const ABI = [{
  inputs: [{ name: 'tokenId', type: 'uint256' }],
  name: 'tokenURI',
  outputs: [{ name: '', type: 'string' }],
  stateMutability: 'view',
  type: 'function',
}];

const client = createPublicClient({
  chain: shape,
  transport: http('https://mainnet.shape.network', { timeout: 15000 }),
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchSvg(tokenId, attempt = 0) {
  try {
    const uri = await client.readContract({
      address: BOOA,
      abi: ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });
    if (!uri.startsWith('data:')) return null;
    const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf-8'));
    if (!json.image?.startsWith('data:image/svg+xml;base64,')) return null;
    return Buffer.from(json.image.split(',')[1], 'base64');
  } catch (e) {
    if (attempt < RETRY) {
      await sleep(1000 * (attempt + 1));
      return fetchSvg(tokenId, attempt + 1);
    }
    return null;
  }
}

async function main() {
  console.log(`Fetching ${TOTAL} BOOAs for ${COLS}x${ROWS} grid (${SIZE}x${SIZE}px)...`);
  console.log(`Batch: ${BATCH}, Retry: ${RETRY}, Delay: ${DELAY}ms`);

  const composites = [];
  let failed = 0;

  for (let start = 0; start < TOTAL; start += BATCH) {
    const end = Math.min(start + BATCH, TOTAL);
    const batch = Array.from({ length: end - start }, (_, i) => start + i);

    const results = await Promise.all(batch.map(async (id) => {
      const svg = await fetchSvg(id);
      if (!svg) { failed++; return null; }
      try {
        const png = await sharp(svg).resize(CELL, CELL, { kernel: 'nearest' }).png().toBuffer();
        const col = id % COLS;
        const row = Math.floor(id / COLS);
        return { input: png, left: col * CELL, top: row * CELL };
      } catch { failed++; return null; }
    }));

    for (const r of results) {
      if (r) composites.push(r);
    }

    const pct = Math.round((end / TOTAL) * 100);
    process.stdout.write(`\r  ${end}/${TOTAL} (${pct}%) — ${composites.length} OK, ${failed} fail`);
    await sleep(DELAY);
  }

  console.log(`\nCompositing ${composites.length} images (${failed} failed)...`);

  const output = await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toBuffer();

  const outPath = `booa-collage-${SIZE}x${SIZE}.png`;
  await sharp(output).toFile(outPath);
  console.log(`Done! ${outPath} (${(output.length / 1024 / 1024).toFixed(1)}MB)`);
}

main();
