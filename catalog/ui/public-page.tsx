import Image from "next/image";
import Link from "next/link";

import { LogoComplete } from "@/components/logo-complete";
import { Button } from "@/components/ui/button";

import welcomeBackground from "../../../public/welcome-background.webp";

const Home = () => (
  <main className="bg-welcome-background text-welcome-foreground relative isolate flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 pt-16 pb-32">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[68svh] min-h-80 [mask-image:linear-gradient(to_bottom,transparent,black_60%)] opacity-35"
    >
      <Image
        alt=""
        className="object-cover object-bottom"
        fill
        loading="eager"
        sizes="100vw"
        src={welcomeBackground}
      />
    </div>
    <div className="t-stagger is-shown flex w-full max-w-xl flex-col items-center text-center">
      <div className="t-stagger-line mb-12 w-36">
        <LogoComplete aria-label="Dinvolt" className="h-auto w-full" />
      </div>
      <h1 className="t-stagger-line t-stagger-line--2 text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl">
        A new beginning.
      </h1>
      <p className="t-stagger-line t-stagger-line--3 text-welcome-muted mt-5 max-w-xs text-base leading-relaxed text-pretty sm:max-w-sm">
        Bring your ideas to life.
        <br />
        Open the admin panel to get started.
      </p>
      <div className="t-stagger-line t-stagger-line--4 mt-8">
        <Button
          nativeButton={false}
          render={<Link href="/admin" prefetch={false} />}
        >
          Open admin panel <span aria-hidden="true">↗</span>
        </Button>
      </div>
    </div>
  </main>
);

export default Home;
