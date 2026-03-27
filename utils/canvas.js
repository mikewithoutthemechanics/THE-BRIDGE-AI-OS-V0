export function safeCreateGradient(ctx, ...args) {
  if (!ctx || typeof ctx.createLinearGradient !== 'function') {
    console.error('Invalid canvas context for gradient creation');
    return null;
  }
  try {
    return ctx.createLinearGradient(...args);
  } catch (e) {
    console.error('Gradient creation failed:', e);
    return null;
  }
}

export function safeCreateRadialGradient(ctx, ...args) {
  if (!ctx || typeof ctx.createRadialGradient !== 'function') {
    console.error('Invalid canvas context for radial gradient creation');
    return null;
  }
  try {
    return ctx.createRadialGradient(...args);
  } catch (e) {
    console.error('Radial gradient creation failed:', e);
    return null;
  }
}

export function safeGetImageData(ctx, ...args) {
  if (!ctx || typeof ctx.getImageData !== 'function') {
    console.error('Invalid canvas context for image data retrieval');
    return null;
  }
  try {
    return ctx.getImageData(...args);
  } catch (e) {
    console.error('Image data retrieval failed:', e);
    return null;
  }
}

export function safePutImageData(ctx, ...args) {
  if (!ctx || typeof ctx.putImageData !== 'function') {
    console.error('Invalid canvas context for image data placement');
    return false;
  }
  try {
    ctx.putImageData(...args);
    return true;
  } catch (e) {
    console.error('Image data placement failed:', e);
    return false;
  }
}

export function safeDrawImage(ctx, ...args) {
  if (!ctx || typeof ctx.drawImage !== 'function') {
    console.error('Invalid canvas context for image drawing');
    return false;
  }
  try {
    ctx.drawImage(...args);
    return true;
  } catch (e) {
    console.error('Image drawing failed:', e);
    return false;
  }
}