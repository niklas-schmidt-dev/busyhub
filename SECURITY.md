# Security

Please report security problems privately via [GitHub's private vulnerability reporting](https://github.com/niklas-schmidt-dev/busyhub/security/advisories/new), not in a public issue. You'll get an answer within a week.

Worth knowing:

- An app that runs **on your computer** has your user's permissions. Catalog apps are reviewed before they are merged; other apps are only as trustworthy as their source.
- The bar's HTTP password and settings marked secret are encrypted with your system keychain (Electron `safeStorage`). On Linux systems without a keyring, they are stored in BusyHub's config file, readable only by your user.
- BusyHub talks to your bar over plain HTTP on your local network, as the bar's API requires.
