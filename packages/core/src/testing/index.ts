/**
 * Test support that ships with core.
 *
 * Not imported by any runtime code — it exists so a platform build can prove
 * its port implementations behave like the ones the web app uses, without
 * copying assertions out of this repository.
 */
export * from './assert';
export * from './conformance';
