import Header from "@/components/ui/header";

export default function PrivatePageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
        <Header />
        <main className="max-w-screen-xl mx-auto px-10 pt-16">{children}</main>
    </>
  );
}
