/** Comments plugin data provider. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { getDataContext, type PluginDataHooks } from '../../data/pluginHooks';
import type { ChronicleComment } from '../../data/types';

function getComments(postId: string): ChronicleComment[] {
  const dir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  const file = path.join(dir, 'comments', `${postId}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const COMMENT_DEFAULTS = {
  backend: '',
  walineServerUrl: '',
  attitude: true,
  showGeoAddress: true,
  imageUploadEnabled: false,
  imageUploadEndpoint: '',
  imageUploadToken: '',
};

function enrichSettings(settings: Record<string, any>): void {
  const dir = getDataContext().dataDir || path.resolve(process.cwd(), 'data');
  let raw: Record<string, any> = {};
  try {
    raw = YAML.parse(fs.readFileSync(path.join(dir, 'site.yml'), 'utf-8')) || {};
  } catch {
    /* no site config */
  }
  const group = raw.comments && typeof raw.comments === 'object' ? raw.comments : {};
  const legacy = raw.post && typeof raw.post === 'object' ? raw.post.comments : undefined;
  settings.post = settings.post || {};
  settings.post.postComments = {
    ...COMMENT_DEFAULTS,
    ...(legacy && typeof legacy === 'object' ? legacy : {}),
    ...group,
  };
}

export const commentsDataHooks: PluginDataHooks = { getComments, enrichSettings };
