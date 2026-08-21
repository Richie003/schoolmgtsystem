import { BrandMark, PRODUCT_NAME } from './PublicNav';
import type { PublicView } from './PublicNav';

export default function PublicFooter({
  onNavigate,
}: {
  onNavigate: (view: PublicView) => void;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-gray-950 text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <BrandMark onClick={() => onNavigate('home')} />
            <p className="mt-3 text-sm leading-relaxed">
              The school operating system for modern African schools. Students,
              staff, attendance and computer-based testing, all in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol title="Product">
              <FooterLink onClick={() => onNavigate('home')}>Home</FooterLink>
              <FooterLink onClick={() => onNavigate('features')}>Features</FooterLink>
              <FooterLink onClick={() => onNavigate('about')}>About us</FooterLink>
              <FooterLink onClick={() => onNavigate('request')}>Get started</FooterLink>
            </FooterCol>
            <FooterCol title="Access">
              <FooterLink onClick={() => onNavigate('login')}>Sign in</FooterLink>
              <FooterLink onClick={() => onNavigate('request')}>Register your school</FooterLink>
            </FooterCol>
            <FooterCol title="Contact">
              <span className="block">Nigeria</span>
              <a href="mailto:hello@nlightr.app" className="block hover:text-white">
                hello@nlightr.app
              </a>
            </FooterCol>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-xs">
          © {year} {PRODUCT_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function FooterLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block text-left transition-colors hover:text-white"
    >
      {children}
    </button>
  );
}
