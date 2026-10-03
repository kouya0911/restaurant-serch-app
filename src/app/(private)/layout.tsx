import Header from "@/components/ui/header";
import { LotteryProvider } from "@/components/ui/lottery-provider";
import { VisitCrowdProvider } from "@/components/ui/visit-crowd";

export const dynamic = 'force-dynamic';

export default function PrivatePageLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LotteryProvider>
      <VisitCrowdProvider>
        <Header />
        {/* モバイル時はヘッダーが2段になるため上部余白(pt)を多めに。左右余白は各コンポーネントで担保するためpx-0 */}
        <main className="max-w-screen-xl mx-auto px-0 md:px-10 pt-[140px] md:pt-24 pb-10">{children}</main>
      </VisitCrowdProvider>
    </LotteryProvider>
  );
}
