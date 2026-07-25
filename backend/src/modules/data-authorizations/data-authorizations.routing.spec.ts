import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DataAuthorizationsModule } from './data-authorizations.module';

interface RouteEntry {
  controller: string;
  method: RequestMethod;
  /** Path segments below the shared `data-authorizations` prefix. */
  segments: string[];
}

function collectRoutes(): RouteEntry[] {
  const controllers: Function[] =
    Reflect.getMetadata('controllers', DataAuthorizationsModule) ?? [];

  const routes: RouteEntry[] = [];

  for (const controller of controllers) {
    const basePath: string = Reflect.getMetadata(PATH_METADATA, controller) ?? '';
    const baseSegments = splitPath(basePath).slice(
      splitPath(basePath).indexOf('data-authorizations') + 1,
    );

    const proto = controller.prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const handler = Object.getOwnPropertyDescriptor(proto, key)?.value;
      if (typeof handler !== 'function') continue;

      const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
      if (methodPath === undefined || requestMethod === undefined) continue;

      routes.push({
        controller: controller.name,
        method: requestMethod,
        segments: [...baseSegments, ...splitPath(methodPath)],
      });
    }
  }

  return routes;
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function shadows(earlier: string[], later: string[]): boolean {
  if (earlier.length !== later.length) return false;
  return earlier.every((segment, index) => {
    const other = later[index]!;
    if (segment.startsWith(':')) return !other.startsWith(':');
    return segment === other;
  });
}

describe('DataAuthorizationsModule route registration', () => {
  const routes = collectRoutes();

  it('registers routes for every controller in the module', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  // Express resolves the first registered match, so a parameterized segment
  // registered before a sibling literal path swallows that literal path.
  it('never registers a parameterized route before a literal route it would shadow', () => {
    const shadowed: string[] = [];

    routes.forEach((earlier, earlierIndex) => {
      routes.slice(earlierIndex + 1).forEach((later) => {
        if (earlier.method !== later.method) return;
        if (!shadows(earlier.segments, later.segments)) return;
        shadowed.push(
          `${RequestMethod[earlier.method]} /${later.segments.join('/')} (${later.controller}) ` +
            `is shadowed by /${earlier.segments.join('/')} (${earlier.controller})`,
        );
      });
    });

    expect(shadowed).toEqual([]);
  });

  it('keeps the catch-all authorization controller registered last', () => {
    const controllers: Function[] =
      Reflect.getMetadata('controllers', DataAuthorizationsModule) ?? [];
    expect(controllers[controllers.length - 1]?.name).toBe('DataAuthorizationsController');
  });
});
