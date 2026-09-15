import NextLink from "next/link";
import { createElement, type ComponentProps } from "react";
import { withBasePath } from "../../lib/base-path";
import { publicDocumentPath, publicOfflineNavigationEnabled } from "../../lib/public-offline-navigation";

export default function PublicDocumentLink({ href, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  const documentPath = publicOfflineNavigationEnabled ? publicDocumentPath(href) : null;
  return documentPath
    ? createElement("a", { ...props, href: withBasePath(documentPath) })
    : createElement(NextLink, { ...props, href });
}
