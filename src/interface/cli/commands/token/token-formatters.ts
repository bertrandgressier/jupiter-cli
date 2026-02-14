import chalk from 'chalk';
import {
  MintInformation,
  ShieldWarning,
  ShieldWarningSeverity,
  PriceV3Data,
  SwapStats,
} from '../../../../application/ports/token-discovery.port';

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return chalk.gray('N/A');
  if (price === 0) return chalk.gray('$0');
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 1000) return `$${price.toFixed(2)}`;
  if (price < 1000000) return `$${(price / 1000).toFixed(1)}K`;
  if (price < 1000000000) return `$${(price / 1000000).toFixed(1)}M`;
  return `$${(price / 1000000000).toFixed(1)}B`;
}

export function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return chalk.gray('N/A');
  if (num < 1000) return num.toFixed(0);
  if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
  if (num < 1000000000) return `${(num / 1000000).toFixed(1)}M`;
  return `${(num / 1000000000).toFixed(1)}B`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return chalk.gray('N/A');
  const sign = value >= 0 ? '+' : '';
  const formatted = `${sign}${value.toFixed(1)}%`;
  if (value > 0) return chalk.green(formatted);
  if (value < 0) return chalk.red(formatted);
  return chalk.gray(formatted);
}

export function formatOrganicScore(score: number, label: string): string {
  switch (label) {
    case 'high':
      return chalk.green(`${score} (high)`);
    case 'medium':
      return chalk.yellow(`${score} (medium)`);
    case 'low':
      return chalk.red(`${score} (low)`);
    default:
      return `${score}`;
  }
}

export function formatSeverity(severity: ShieldWarningSeverity): string {
  switch (severity) {
    case 'critical':
      return chalk.bgRed.white(' CRITICAL ');
    case 'warning':
      return chalk.bgYellow.black(' WARNING  ');
    case 'info':
      return chalk.bgBlue.white('   INFO   ');
    default:
      return severity;
  }
}

export function formatVerified(isVerified: boolean | null | undefined): string {
  if (isVerified) return chalk.green('V');
  return chalk.gray('x');
}

export function displayTokenTable(tokens: MintInformation[], showStats = false): void {
  if (tokens.length === 0) {
    console.log(chalk.yellow('No tokens found.'));
    return;
  }

  if (showStats) {
    console.log(
      `${chalk.gray('').padEnd(2)} ${chalk.gray('Symbol').padEnd(10)} ${chalk.gray('Price').padEnd(12)} ${chalk.gray('MCap').padEnd(10)} ${chalk.gray('Liq').padEnd(10)} ${chalk.gray('24h').padEnd(10)} ${chalk.gray('Vol 24h').padEnd(10)} ${chalk.gray('Holders').padEnd(10)} ${chalk.gray('Score').padEnd(8)} ${chalk.gray('Address')}`
    );
    console.log(chalk.gray('-'.repeat(120)));
  } else {
    console.log(
      `${chalk.gray('').padEnd(2)} ${chalk.gray('Symbol').padEnd(10)} ${chalk.gray('Name').padEnd(25)} ${chalk.gray('Price').padEnd(12)} ${chalk.gray('MCap').padEnd(10)} ${chalk.gray('Score').padEnd(8)} ${chalk.gray('Address')}`
    );
    console.log(chalk.gray('-'.repeat(110)));
  }

  for (const token of tokens) {
    const verified = formatVerified(token.isVerified);
    const symbol = token.symbol.slice(0, 9).padEnd(10);
    const price = formatPrice(token.usdPrice).padEnd(12);
    const mcap = formatLargeNumber(token.mcap).padEnd(10);
    const score = formatOrganicScore(token.organicScore, token.organicScoreLabel).padEnd(8);
    const mintShort = chalk.dim(token.id.slice(0, 8) + '...' + token.id.slice(-4));

    if (showStats) {
      const liq = formatLargeNumber(token.liquidity).padEnd(10);
      const change24h = formatPercent(token.stats24h?.priceChange).padEnd(10);
      const vol24h = formatLargeNumber(
        token.stats24h ? (token.stats24h.buyVolume ?? 0) + (token.stats24h.sellVolume ?? 0) : null
      ).padEnd(10);
      const holders = formatLargeNumber(token.holderCount).padEnd(10);

      console.log(
        `${verified.padEnd(2)} ${symbol} ${price} ${mcap} ${liq} ${change24h} ${vol24h} ${holders} ${score} ${mintShort}`
      );
    } else {
      const name = (token.name || '').slice(0, 24).padEnd(25);
      console.log(`${verified.padEnd(2)} ${symbol} ${name} ${price} ${mcap} ${score} ${mintShort}`);
    }
  }
}

export function displayTokenDetails(
  token: MintInformation,
  warnings: ShieldWarning[],
  price: PriceV3Data | null
): void {
  console.log(chalk.bold(`\n${token.name} (${token.symbol})`));
  console.log(chalk.gray('-'.repeat(60)));

  // Basic info
  console.log(`  ${chalk.gray('Mint:')}       ${token.id}`);
  console.log(
    `  ${chalk.gray('Verified:')}   ${token.isVerified ? chalk.green('Yes') : chalk.red('No')}`
  );
  console.log(`  ${chalk.gray('Decimals:')}   ${token.decimals}`);
  console.log(`  ${chalk.gray('Program:')}    ${token.tokenProgram || chalk.gray('N/A')}`);
  if (token.dev) {
    console.log(`  ${chalk.gray('Developer:')}  ${chalk.dim(token.dev)}`);
  }
  if (token.launchpad) {
    console.log(`  ${chalk.gray('Launchpad:')}  ${token.launchpad}`);
  }

  // Market data
  console.log(chalk.bold('\n  Market Data'));
  console.log(`  ${chalk.gray('Price:')}       ${formatPrice(token.usdPrice)}`);
  console.log(`  ${chalk.gray('MCap:')}        ${formatLargeNumber(token.mcap)}`);
  console.log(`  ${chalk.gray('FDV:')}         ${formatLargeNumber(token.fdv)}`);
  console.log(`  ${chalk.gray('Liquidity:')}   ${formatLargeNumber(token.liquidity)}`);
  console.log(`  ${chalk.gray('Holders:')}     ${formatLargeNumber(token.holderCount)}`);

  if (token.circSupply) {
    console.log(`  ${chalk.gray('Circ Supply:')} ${formatLargeNumber(token.circSupply)}`);
  }
  if (token.totalSupply) {
    console.log(`  ${chalk.gray('Total Supply:')} ${formatLargeNumber(token.totalSupply)}`);
  }

  // Price V3 data
  if (price) {
    console.log(chalk.bold('\n  Price Details'));
    console.log(`  ${chalk.gray('Price:')}       $${price.price}`);
    console.log(`  ${chalk.gray('Type:')}        ${price.type}`);

    if (price.extraInfo?.confidenceLevel) {
      const conf = price.extraInfo.confidenceLevel;
      const confFormatted =
        conf === 'high'
          ? chalk.green(conf)
          : conf === 'medium'
            ? chalk.yellow(conf)
            : chalk.red(conf);
      console.log(`  ${chalk.gray('Confidence:')} ${confFormatted}`);
    }

    if (price.extraInfo?.quotedPrice) {
      console.log(`  ${chalk.gray('Buy Price:')}  $${price.extraInfo.quotedPrice.buyPrice}`);
      console.log(`  ${chalk.gray('Sell Price:')} $${price.extraInfo.quotedPrice.sellPrice}`);
    }

    if (price.extraInfo?.depth) {
      console.log(chalk.bold('\n  Depth (Price Impact)'));
      if (price.extraInfo.depth.buyPriceImpactRatio?.depth) {
        const d = price.extraInfo.depth.buyPriceImpactRatio.depth;
        console.log(
          `  ${chalk.gray('Buy  $10:')} ${(d['10'] * 100).toFixed(2)}%  ${chalk.gray('$100:')} ${(d['100'] * 100).toFixed(2)}%  ${chalk.gray('$1K:')} ${(d['1000'] * 100).toFixed(2)}%`
        );
      }
      if (price.extraInfo.depth.sellPriceImpactRatio?.depth) {
        const d = price.extraInfo.depth.sellPriceImpactRatio.depth;
        console.log(
          `  ${chalk.gray('Sell $10:')} ${(d['10'] * 100).toFixed(2)}%  ${chalk.gray('$100:')} ${(d['100'] * 100).toFixed(2)}%  ${chalk.gray('$1K:')} ${(d['1000'] * 100).toFixed(2)}%`
        );
      }
    }
  }

  // Stats across intervals
  console.log(chalk.bold('\n  Trading Stats'));
  const intervals: {
    key: keyof Pick<MintInformation, 'stats5m' | 'stats1h' | 'stats6h' | 'stats24h'>;
    label: string;
  }[] = [
    { key: 'stats5m', label: '5m' },
    { key: 'stats1h', label: '1h' },
    { key: 'stats6h', label: '6h' },
    { key: 'stats24h', label: '24h' },
  ];

  console.log(
    `  ${chalk.gray('').padEnd(8)} ${chalk.gray('Price').padEnd(10)} ${chalk.gray('Volume').padEnd(12)} ${chalk.gray('Buys').padEnd(8)} ${chalk.gray('Sells').padEnd(8)} ${chalk.gray('Traders').padEnd(8)} ${chalk.gray('Holders')}`
  );

  for (const { key, label } of intervals) {
    const stats = token[key] as SwapStats | null;
    if (!stats) {
      console.log(`  ${chalk.gray(label.padEnd(8))} ${chalk.gray('No data')}`);
      continue;
    }

    const priceChange = formatPercent(stats.priceChange).padEnd(10);
    const totalVol = (stats.buyVolume ?? 0) + (stats.sellVolume ?? 0);
    const vol = formatLargeNumber(totalVol).padEnd(12);
    const buys = (stats.numBuys?.toString() ?? '-').padEnd(8);
    const sells = (stats.numSells?.toString() ?? '-').padEnd(8);
    const traders = (stats.numTraders?.toString() ?? '-').padEnd(8);
    const holderChange =
      stats.holderChange !== null && stats.holderChange !== undefined
        ? formatPercent(stats.holderChange)
        : chalk.gray('-');

    console.log(
      `  ${label.padEnd(8)} ${priceChange} ${vol} ${buys} ${sells} ${traders} ${holderChange}`
    );
  }

  // Audit info
  if (token.audit) {
    console.log(chalk.bold('\n  Audit'));
    if (token.audit.isSus !== null) {
      console.log(
        `  ${chalk.gray('Suspicious:')}          ${token.audit.isSus ? chalk.red('Yes') : chalk.green('No')}`
      );
    }
    if (token.audit.mintAuthorityDisabled !== null) {
      console.log(
        `  ${chalk.gray('Mint Auth Disabled:')}  ${token.audit.mintAuthorityDisabled ? chalk.green('Yes') : chalk.red('No')}`
      );
    }
    if (token.audit.freezeAuthorityDisabled !== null) {
      console.log(
        `  ${chalk.gray('Freeze Auth Disabled:')} ${token.audit.freezeAuthorityDisabled ? chalk.green('Yes') : chalk.red('No')}`
      );
    }
    if (
      token.audit.topHoldersPercentage !== null &&
      token.audit.topHoldersPercentage !== undefined
    ) {
      console.log(
        `  ${chalk.gray('Top Holders %:')}       ${token.audit.topHoldersPercentage.toFixed(1)}%`
      );
    }
    if (
      token.audit.devBalancePercentage !== null &&
      token.audit.devBalancePercentage !== undefined
    ) {
      console.log(
        `  ${chalk.gray('Dev Balance %:')}       ${token.audit.devBalancePercentage.toFixed(1)}%`
      );
    }
    if (token.audit.devMigrations !== null && token.audit.devMigrations !== undefined) {
      console.log(`  ${chalk.gray('Dev Migrations:')}      ${token.audit.devMigrations}`);
    }
  }

  // Organic score
  console.log(chalk.bold('\n  Trust Signals'));
  console.log(
    `  ${chalk.gray('Organic Score:')} ${formatOrganicScore(token.organicScore, token.organicScoreLabel)}`
  );
  if (token.tags && token.tags.length > 0) {
    console.log(`  ${chalk.gray('Tags:')}          ${token.tags.join(', ')}`);
  }
  if (token.cexes && token.cexes.length > 0) {
    console.log(`  ${chalk.gray('CEX Listings:')}  ${token.cexes.join(', ')}`);
  }

  // Links
  const links: string[] = [];
  if (token.website) links.push(`Website: ${token.website}`);
  if (token.twitter) links.push(`Twitter: ${token.twitter}`);
  if (token.telegram) links.push(`Telegram: ${token.telegram}`);

  if (links.length > 0) {
    console.log(chalk.bold('\n  Links'));
    for (const link of links) {
      console.log(`  ${chalk.dim(link)}`);
    }
  }

  // First pool
  if (token.firstPool) {
    console.log(chalk.bold('\n  Listing'));
    console.log(`  ${chalk.gray('First Pool:')} ${chalk.dim(token.firstPool.id)}`);
    console.log(`  ${chalk.gray('Created At:')} ${token.firstPool.createdAt}`);
  }

  // Shield warnings
  if (warnings.length > 0) {
    console.log(chalk.bold('\n  Security Warnings'));
    for (const warning of warnings) {
      console.log(`  ${formatSeverity(warning.severity)} ${warning.message}`);
      if (warning.source) {
        console.log(`  ${chalk.gray(`  Source: ${warning.source}`)}`);
      }
    }
  } else {
    console.log(chalk.green('\n  No security warnings detected.'));
  }

  console.log();
}

export function displayShieldWarnings(warnings: Record<string, ShieldWarning[]>): void {
  const mints = Object.keys(warnings);

  if (mints.length === 0) {
    console.log(chalk.yellow('No shield data returned.'));
    return;
  }

  for (const mint of mints) {
    const mintWarnings = warnings[mint] ?? [];
    const mintShort = mint.slice(0, 8) + '...' + mint.slice(-4);

    if (mintWarnings.length === 0) {
      console.log(`${chalk.green('SAFE')} ${chalk.dim(mintShort)} - No warnings`);
    } else {
      const hasCritical = mintWarnings.some((w) => w.severity === 'critical');
      const hasWarning = mintWarnings.some((w) => w.severity === 'warning');

      const status = hasCritical
        ? chalk.bgRed.white(' DANGER ')
        : hasWarning
          ? chalk.bgYellow.black(' CAUTION ')
          : chalk.bgBlue.white(' INFO ');

      console.log(`${status} ${chalk.dim(mintShort)}`);

      for (const warning of mintWarnings) {
        console.log(`  ${formatSeverity(warning.severity)} ${warning.type}`);
        console.log(`    ${chalk.dim(warning.message)}`);
      }
    }
    console.log();
  }
}
