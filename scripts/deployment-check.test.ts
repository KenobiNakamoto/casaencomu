import { expect, it } from 'vitest';
import { checkDeployment } from '../air/ops/deployment-check.mjs';
it('accepts only an exact HTTPS origin with preview bypasses disabled', () => {
  expect(checkDeployment({PUBLIC_URL:'https://casa.example.com:8443'})).toBe('https://casa.example.com:8443');
  for(const url of ['http://casa.example.com','https://user:pass@casa.example.com','https://casa.example.com/path','https://casa.example.com?x=1','https://casa.example.com/#x']) expect(() => checkDeployment({PUBLIC_URL:url})).toThrow();
  for(const key of ['AUTH_DEV_EMAIL','PREVIEW_OPEN_AS','PREVIEW_PASSWORD','CASA_PROJECT']) expect(() => checkDeployment({PUBLIC_URL:'https://casa.example.com',[key]:'set'})).toThrow();
});
it('rejects partial gates, example credentials and short setup keys', () => {
  for(const env of [{CF_ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com'}, {CF_ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',CF_ACCESS_AUD:'replace-me'}, {CASA_SETUP_TOKEN:'short'}]) expect(() => checkDeployment({PUBLIC_URL:'https://casa.example.com',...env})).toThrow();
});
