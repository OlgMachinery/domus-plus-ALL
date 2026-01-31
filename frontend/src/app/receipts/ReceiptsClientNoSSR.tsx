"use client";

import dynamic from "next/dynamic";

import type { ReceiptsClientProps } from "./ReceiptsClient";

const ReceiptsClient = dynamic(() => import("./ReceiptsClient"), { ssr: false });

export default function ReceiptsClientNoSSR(props: ReceiptsClientProps) {
  return <ReceiptsClient {...props} />;
}
