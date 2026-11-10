import LandingShell from './landing/LandingShell';
import Hero from './landing/sections/Hero';
import Ticker from './landing/sections/Ticker';
import Process from './landing/sections/Process';
import Included from './landing/sections/Included';
import Advantages from './landing/sections/Advantages';
import CtaBand from './landing/sections/CtaBand';
import Faq from './landing/sections/Faq';

export default function Landing() {
  return (
    <LandingShell>
      {(t, loggedIn) => (
        <>
          <Hero t={t} loggedIn={loggedIn} />
          <Ticker t={t} />
          <Process t={t} />
          <Included t={t} />
          <Advantages t={t} />
          <Faq t={t} />
          <CtaBand t={t} loggedIn={loggedIn} />
        </>
      )}
    </LandingShell>
  );
}
