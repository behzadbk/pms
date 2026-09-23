# infra/ — Docker، Kubernetes و CI/CD

جزئیات تصمیمات معماری در `docs/ARCHITECTURE-SAAS.md` بخش ۷ توضیح داده شده؛ این فایل صرفاً نقشه این پوشه است.

```
infra/
  docker/
    Dockerfile.nestjs      -> الگوی مشترک Multi-stage برای هر میکروسرویس NestJS (با build-arg SERVICE_PATH)
    Dockerfile.frontend    -> Build فرانت‌اند PWA + سرو با Nginx
    nginx.conf             -> کانفیگ Nginx (SPA fallback، عدم کش sw.js/manifest، کش بلندمدت assetهای hash‌دار)
  k8s/base/
    namespace.yaml
    configmap.yaml                     -> مقادیر غیرحساس مشترک
    secret.example.yaml                -> ⚠️ فقط نمونه ساختار — مقادیر واقعی را commit نکنید
    deployment-service.template.yaml   -> الگو برای ساخت manifest سرویس جدید
    deployment.identity-svc.yaml       -> نمونه پرشده (Deployment + Service + HPA)
    deployment.property-svc.yaml
    deployment.facility-svc.yaml
    deployment.finance-svc.yaml
    deployment.guard-svc.yaml
    deployment.notification-svc.yaml
    deployment.frontend.yaml
    ingress.yaml                       -> مسیریابی path-based به همه سرویس‌ها
    migration-job.template.yaml        -> الگوی مشترک Job مهاجرت (اجرای مستقیم RLS SQL هر سرویس)
    migration-job.identity-svc.yaml    -> و migration-job.<svc>.yaml برای هر ۵ سرویس دیگر
    postgres-statefulset.optional.yaml -> جایگزین self-hosted (توصیه اصلی: Managed DB)
```

## ترتیب راه‌اندازی اولیه کلاستر (دستی، یک‌بار)

```bash
kubectl apply -f infra/k8s/base/namespace.yaml
kubectl apply -f infra/k8s/base/configmap.yaml
# Secret واقعی را جایگزین secret.example.yaml کنید (یا External Secrets Operator را نصب کنید)
kubectl apply -f infra/k8s/base/secret.example.yaml   # فقط برای محیط dev/دمو
kubectl apply -f infra/k8s/base/ingress.yaml
for f in infra/k8s/base/deployment.*.yaml; do kubectl apply -f "$f"; done
```

پس از آن، CI/CD (`.github/workflows/ci-cd.yml`) در هر push به `main` به‌طور خودکار:
تست → build ایمیج → push به `ghcr.io` → اجرای migration Job → به‌روزرسانی تگ ایمیج در هر Deployment (rolling update).

## Secret مورد نیاز در GitHub Actions
- `KUBE_CONFIG_B64`: خروجی `cat ~/.kube/config | base64 -w0` برای دسترسی به کلاستر هدف
- `VITE_VAPID_PUBLIC_KEY`: کلید عمومی Web Push (اختیاری) — در زمان build به فرانت‌اند تزریق می‌شود
- (`GITHUB_TOKEN` به‌صورت خودکار توسط GitHub فراهم می‌شود و نیازی به تنظیم دستی ندارد)

## محدودیت شناخته‌شده این تحویل
Dockerfileها و مانیفست‌های K8s syntax-valid هستند (YAML آن‌ها اعتبارسنجی شده) اما در این محیط
Docker/Kubernetes واقعی برای build/apply واقعی در دسترس نبود — پیش از استقرار Production،
یک اجرای دستی `docker build` و `kubectl apply --dry-run=client` برای هر فایل توصیه می‌شود.
