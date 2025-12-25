import { BackstageIdentityResponse } from '@backstage/plugin-auth-node';
import { createBackendModule } from '@backstage/backend-plugin-api';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { catalogServiceRef } from '@backstage/plugin-catalog-node/alpha';
import {
  AuthorizeResult,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  PermissionPolicy,
  PolicyQuery,
} from '@backstage/plugin-permission-node';
import { CatalogApi } from '@backstage/catalog-client';

/**
 * Permission Policy на основе гранулярных аннотаций
 * 
 * Аннотации:
 *   backstage.io/can-deploy: "true"           → ArgoCD sync, Scaffolder execute
 *   backstage.io/can-create-resources: "true" → Resource entity operations
 *   backstage.io/can-create-templates: "true" → Template entity operations
 *   backstage.io/admin: "true"                → Полный доступ
 * 
 * Без аннотаций → только чтение
 */
class CustomPermissionPolicy implements PermissionPolicy {
  private catalogApi: CatalogApi;

  constructor(catalogApi: CatalogApi) {
    this.catalogApi = catalogApi;
  }

  async handle(
    request: PolicyQuery,
    user?: BackstageIdentityResponse,
  ): Promise<PolicyDecision> {
    
    if (!user) {
      return { result: AuthorizeResult.DENY };
    }

    const permissionName = request.permission.name;
    const userEntityRef = user.identity.userEntityRef;

    // Загружаем аннотации пользователя
    const userAnnotations = await this.getUserAnnotations(userEntityRef);

    // Админ может ВСЁ
    if (userAnnotations['backstage.io/admin'] === 'true') {
      return { result: AuthorizeResult.ALLOW };
    }

    // Проверяем чтение — разрешено всем
    if (this.isReadPermission(permissionName)) {
      return { result: AuthorizeResult.ALLOW };
    }

    // Проверяем deploy (ArgoCD, Scaffolder execute)
    if (this.isDeployPermission(permissionName)) {
      if (userAnnotations['backstage.io/can-deploy'] === 'true') {
        return { result: AuthorizeResult.ALLOW };
      }
      return { result: AuthorizeResult.DENY };
    }

    // Проверяем создание ресурсов
    if (this.isResourcePermission(permissionName)) {
      if (userAnnotations['backstage.io/can-create-resources'] === 'true') {
        return { result: AuthorizeResult.ALLOW };
      }
      return { result: AuthorizeResult.DENY };
    }

    // Проверяем создание/запуск шаблонов
    if (this.isTemplatePermission(permissionName)) {
      if (userAnnotations['backstage.io/can-create-templates'] === 'true') {
        return { result: AuthorizeResult.ALLOW };
      }
      return { result: AuthorizeResult.DENY };
    }

    // Всё остальное — запрет по умолчанию
    return { result: AuthorizeResult.DENY };
  }

  /**
   * Загружает аннотации пользователя из каталога
   */
  private async getUserAnnotations(
    userEntityRef: string | undefined,
  ): Promise<Record<string, string>> {
    if (!userEntityRef) {
      return {};
    }

    try {
      const userEntity = await this.catalogApi.getEntityByRef(userEntityRef);
      return userEntity?.metadata.annotations || {};
    } catch (error) {
      console.warn(`User entity not found: ${userEntityRef}`);
      return {};
    }
  }

  /**
   * Проверяет, является ли permission операцией чтения
   */
  private isReadPermission(permissionName: string): boolean {
    return (
      permissionName.includes('read') ||
      permissionName.includes('get') ||
      permissionName.includes('list')
    );
  }

  /**
   * Проверяет, является ли permission операцией деплоя
   * ArgoCD sync, Scaffolder action execute
   */
  private isDeployPermission(permissionName: string): boolean {
    return (
      permissionName.includes('argocd') ||
      permissionName.includes('sync') ||
      permissionName.includes('scaffolder.action.execute') ||
      permissionName.includes('scaffolder.task')
    );
  }

  /**
   * Проверяет, является ли permission операцией с Resource
   */
  private isResourcePermission(permissionName: string): boolean {
    return (
      permissionName.includes('catalog.entity.create') ||
      permissionName.includes('catalog.entity.delete') ||
      permissionName.includes('catalog.entity.refresh')
    );
  }

  /**
   * Проверяет, является ли permission операцией с Template
   */
  private isTemplatePermission(permissionName: string): boolean {
    return (
      permissionName.includes('scaffolder.template') ||
      permissionName.includes('template')
    );
  }
}

// Backend Module для регистрации политики
export default createBackendModule({
  pluginId: 'permission',
  moduleId: 'custom-policy',
  register(reg) {
    reg.registerInit({
      deps: {
        policy: policyExtensionPoint,
        catalog: catalogServiceRef,
      },
      async init({ policy, catalog }) {
        policy.setPolicy(new CustomPermissionPolicy(catalog));
      },
    });
  },
});
