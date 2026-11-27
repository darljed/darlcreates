import { connection } from "next/server";
import { ImageGallery } from "@/components/ai/image-gallery";
import { PageHeader } from "@/components/shell/ui";
import { adminListProducts } from "@/lib/admin";
import { listImageModels } from "@/lib/ai/providers";
import { getAiKey, getAiPrefs } from "@/lib/ai/settings";
import { productGallery, realPhotoCount } from "@/lib/ai/image-studio";

export const metadata = { title: "Image gallery · Admin" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImageGalleryPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await connection(); // the model list cache reads the clock, which Cache Components forbids during prerender
  const { product } = await searchParams;
  const productId = product && UUID.test(product) ? product : null;
  const [prefs, key, models, list, gallery, photoCount] = await Promise.all([
    getAiPrefs(),
    getAiKey("openrouter"),
    listImageModels(),
    adminListProducts(),
    productId ? productGallery(productId) : Promise.resolve([]),
    productId ? realPhotoCount(productId) : Promise.resolve(0),
  ]);
  const products = list.filter((p) => !p.isService && !p.designer).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-3">
      <PageHeader
        title="Image gallery"
        description="One-click product pictures from presets — Cover, Studio, Lifestyle, Detail and your own. Turn each one on the product or off; nothing reaches the shop's pages until a picture is on the product."
      />
      <ImageGallery
        products={products}
        productId={productId}
        gallery={gallery}
        photoCount={photoCount}
        imageModels={models.ok ? models.models : []}
        defaultImageModel={prefs.imageModel}
        ready={{ openrouterKey: Boolean(key) }}
      />
    </div>
  );
}
