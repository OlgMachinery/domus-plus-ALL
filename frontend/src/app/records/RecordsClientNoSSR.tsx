"use client";

import dynamic from "next/dynamic";

import type { RecordsClientProps } from "./RecordsClient";

const RecordsClient = dynamic(() => import("./RecordsClient"), { ssr: false });

export default function RecordsClientNoSSR(props: RecordsClientProps) {
  return <RecordsClient {...props} />;
}
