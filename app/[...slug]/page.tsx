import { notFound } from 'next/navigation';
import { SingleRentApp } from '@/app/page';
import { staticRouteParams, viewForPath } from '@/lib/routes';

export function generateStaticParams() {
  return staticRouteParams;
}

export default async function RoutedPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const view = viewForPath(`/${slug.join('/')}`);

  if (!view) notFound();

  return <SingleRentApp initialView={view} />;
}
