import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { initChain, appendBlock, verifyChain, getChainStatus, splitRawDocuments, generateReleaseNotes, verifyAsset, rolloverChain } from './chain.js';
import { computeDiff, formatDiffConsole } from './diff.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const logo = `
${colors.bold}${colors.cyan} __     __ _    __  __ _      ${colors.magenta}  _____ _           _       
${colors.bold}${colors.cyan} \\ \\   / // \\  |  \\/  | |     ${colors.magenta} / ____| |         (_)      
${colors.bold}${colors.cyan}  \\ \\_/ // _ \\ | \\  / | |     ${colors.magenta}| |    | |__   __ _ _ _ __  
${colors.bold}${colors.cyan}   \\   // ___ \\| |\\/| | |     ${colors.magenta}| |    | '_ \\ / _\` | | '_ \\ 
${colors.bold}${colors.cyan}    | //_/   \\_\\_|  |_| |____ ${colors.magenta}| |____| | | | (_| | | | | |
${colors.bold}${colors.cyan}    |_|               |______|${colors.magenta} \\_____|_| |_|\\__,_|_|_| |_|
${colors.reset}`;

export function createCli() {
  const program = new Command();

  program
    .name('yaml-chain')
    .description('Cryptographically secured multi-document YAML block chain CLI')
    .version('1.0.0');

  // helper to get data string from option
  async function resolveData(options) {
    if (options.file) {
      try {
        return await fs.readFile(options.file, 'utf8');
      } catch (err) {
        console.error(`${colors.red}${colors.bold}Error: ${colors.reset}Could not read file '${options.file}': ${err.message}`);
        process.exit(1);
      }
    }
    if (options.data) {
      return options.data;
    }
    return null;
  }

  program
    .command('init')
    .argument('<file>', 'Path to the yaml-chain file to create')
    .option('-d, --data <yaml-string>', 'Initial document data payload')
    .option('-f, --file <file-path>', 'Path to file containing initial document data payload')
    .description('Initialize a new YAML chain file with a genesis block')
    .action(async (file, options) => {
      console.log(logo);
      const data = await resolveData(options) || 'message: "Genesis block initialized."\n';
      const resolvedPath = path.resolve(file);
      
      try {
        const meta = await initChain(resolvedPath, data);
        console.log(`\n✨ ${colors.green}${colors.bold}Success:${colors.reset} Initialized YAML chain at ${colors.bold}${file}${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
        console.log(`${colors.bold}Block Index:${colors.reset} 0 (Genesis)`);
        console.log(`${colors.bold}Timestamp:${colors.reset}   ${meta.timestamp}`);
        console.log(`${colors.bold}Data Hash:${colors.reset}   ${colors.yellow}${meta.data_hash}${colors.reset}`);
        console.log(`${colors.bold}Block Hash:${colors.reset}  ${colors.magenta}${meta.meta_hash}${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error during initialization:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('append')
    .argument('<file>', 'Path to the yaml-chain file')
    .option('-d, --data <yaml-string>', 'Document data payload to append')
    .option('-f, --file <file-path>', 'Path to file containing data payload to append')
    .description('Append a new document block to the end of the YAML chain')
    .action(async (file, options) => {
      const data = await resolveData(options);
      if (!data) {
        console.error(`${colors.red}${colors.bold}Error: ${colors.reset}You must provide data using -d or -f option.`);
        process.exit(1);
      }
      
      const resolvedPath = path.resolve(file);
      try {
        const meta = await appendBlock(resolvedPath, data);
        console.log(`\n🔗 ${colors.green}${colors.bold}Block appended successfully!${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
        console.log(`${colors.bold}Block Index:${colors.reset} ${meta.block_index}`);
        console.log(`${colors.bold}Timestamp:${colors.reset}   ${meta.timestamp}`);
        console.log(`${colors.bold}Data Hash:${colors.reset}   ${colors.yellow}${meta.data_hash}${colors.reset}`);
        console.log(`${colors.bold}Prev Hash:${colors.reset}   ${colors.gray}${meta.prev_meta_hash}${colors.reset}`);
        console.log(`${colors.bold}Block Hash:${colors.reset}  ${colors.magenta}${meta.meta_hash}${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error appending block:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('verify')
    .argument('<file>', 'Path to the yaml-chain file to verify')
    .option('--diff', 'Show a line-by-line diff of tampered data compared to previous block if possible')
    .option('-c, --compare-with <known-good-file>', 'Cross-file comparison with a known-good backup file to show the exact changes in the tampered block')
    .description('Cryptographically verify the entire YAML chain integrity')
    .action(async (file, options) => {
      const resolvedPath = path.resolve(file);
      console.log(`🔍 ${colors.bold}Verifying chain integrity for:${colors.reset} ${file} ...`);
      
      try {
        const report = await verifyChain(resolvedPath);
        
        if (report.valid) {
          console.log(`\n✅ ${colors.green}${colors.bold}VERIFICATION PASSED:${colors.reset} The YAML chain is complete, cryptographically intact, and untampered.`);
          process.exit(0);
        } else {
          console.log(`\n❌ ${colors.red}${colors.bold}VERIFICATION FAILED! TAMPER DETECTED!${colors.reset}`);
          console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
          console.log(`${colors.bold}Reason:${colors.reset}        ${colors.red}${report.reason}${colors.reset}`);
          console.log(`${colors.bold}Failed Block:${colors.reset}  Block ${report.blockIndex !== undefined ? report.blockIndex : 'N/A'}`);
          console.log(`${colors.bold}Component:${colors.reset}     ${colors.yellow}${report.tamperedComponent || 'N/A'}${colors.reset}`);
          
          if (report.expected !== undefined || report.actual !== undefined) {
            console.log(`${colors.bold}Expected:${colors.reset}      ${colors.green}${report.expected}${colors.reset}`);
            console.log(`${colors.bold}Actual:${colors.reset}        ${colors.red}${report.actual}${colors.reset}`);
          }
          console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
          
          if (options.compareWith) {
            const comparePath = path.resolve(options.compareWith);
            try {
              const compareContent = await fs.readFile(comparePath, 'utf8');
              const compareDocs = splitRawDocuments(compareContent);
              
              if (report.tamperedComponent === 'data') {
                const knownGoodDoc = compareDocs[2 * report.blockIndex];
                const tamperedDoc = report.dataText;
                
                if (knownGoodDoc !== undefined && tamperedDoc !== undefined) {
                  console.log(`\n🌱 ${colors.bold}Diffing original block (from known-good file) ➡️ tampered block:${colors.reset}`);
                  console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
                  const diff = computeDiff(knownGoodDoc, tamperedDoc);
                  console.log(formatDiffConsole(diff));
                  console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
                } else {
                  console.log(`\n${colors.yellow}Warning: Could not locate Block ${report.blockIndex} in known-good file to diff against.${colors.reset}`);
                }
              } else {
                console.log(`\n${colors.yellow}Comparison file is provided, but failure is in the '${report.tamperedComponent}' component instead of document data.${colors.reset}`);
              }
            } catch (err) {
              console.error(`\n❌ ${colors.red}Error reading known-good comparison file:${colors.reset} ${err.message}`);
            }
          } else if (options.diff && report.tamperedComponent === 'data' && report.blockIndex > 0) {
            console.log(`\n${colors.bold}Diffing Block ${report.blockIndex} with previous Block ${report.blockIndex - 1}:${colors.reset}`);
            
            const content = await fs.readFile(resolvedPath, 'utf8');
            const docs = splitRawDocuments(content);
            const prevBlockData = docs[2 * (report.blockIndex - 1)];
            const currentBlockData = report.dataText;
            
            if (prevBlockData !== undefined && currentBlockData !== undefined) {
              const diff = computeDiff(prevBlockData, currentBlockData);
              console.log(formatDiffConsole(diff));
            } else {
              console.log(`${colors.gray}(Could not extract document strings to perform diff)${colors.reset}`);
            }
          } else if (options.diff && report.tamperedComponent === 'data' && report.blockIndex === 0) {
            console.log(`\n${colors.gray}(Block 0 is the Genesis block. No previous block exists to diff against.)${colors.reset}`);
          }
          
          process.exit(1);
        }
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error performing verification:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('status')
    .argument('<file>', 'Path to the yaml-chain file')
    .description('Get the current status and block statistics of the YAML chain')
    .action(async (file) => {
      const resolvedPath = path.resolve(file);
      try {
        const status = await getChainStatus(resolvedPath);
        console.log(`\n📊 ${colors.bold}YAML Chain Status:${colors.reset} ${file}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
        console.log(`${colors.bold}File Health:${colors.reset}    ${status.isHealthy ? `${colors.green}Healthy${colors.reset}` : `${colors.red}Malformed${colors.reset}`}`);
        console.log(`${colors.bold}Block Count:${colors.reset}    ${status.blockCount}`);
        
        if (status.lastBlock) {
          console.log(`${colors.bold}Last Block No:${colors.reset}  ${status.lastBlock.block_index}`);
          console.log(`${colors.bold}Last Timestamp:${colors.reset} ${status.lastBlock.timestamp}`);
          console.log(`${colors.bold}Last Hash:${colors.reset}      ${colors.magenta}${status.lastBlock.meta_hash}${colors.reset}`);
        }
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error getting status:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('diff')
    .argument('<file>', 'Path to the yaml-chain file')
    .requiredOption('--block-a <index>', 'Index of original block (e.g. 0)', parseInt)
    .requiredOption('--block-b <index>', 'Index of target block (e.g. 1)', parseInt)
    .description('Show a detailed line-by-line diff between any two data blocks in the chain')
    .action(async (file, options) => {
      const resolvedPath = path.resolve(file);
      try {
        const fileContent = await fs.readFile(resolvedPath, 'utf8');
        const docs = splitRawDocuments(fileContent);
        
        const blockA = options.blockA;
        const blockB = options.blockB;
        const blockCount = docs.length / 2;
        
        if (blockA < 0 || blockA >= blockCount) {
          console.error(`${colors.red}${colors.bold}Error:${colors.reset} --block-a index '${blockA}' is out of bounds. File has ${blockCount} blocks.`);
          process.exit(1);
        }
        if (blockB < 0 || blockB >= blockCount) {
          console.error(`${colors.red}${colors.bold}Error:${colors.reset} --block-b index '${blockB}' is out of bounds. File has ${blockCount} blocks.`);
          process.exit(1);
        }
        
        const dataA = docs[2 * blockA];
        const dataB = docs[2 * blockB];
        
        console.log(`\n🌱 ${colors.bold}Diffing Block ${blockA} (Original) ➡️ Block ${blockB} (Modified):${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
        const diff = computeDiff(dataA, dataB);
        console.log(formatDiffConsole(diff));
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error computing diff:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('show')
    .argument('<file>', 'Path to the yaml-chain file')
    .argument('<index>', 'Block index to print', parseInt)
    .description('Print the raw data payload of a specific block')
    .action(async (file, index) => {
      const resolvedPath = path.resolve(file);
      try {
        const fileContent = await fs.readFile(resolvedPath, 'utf8');
        const docs = splitRawDocuments(fileContent);
        const blockCount = docs.length / 2;
        
        if (index < 0 || index >= blockCount) {
          console.error(`${colors.red}${colors.bold}Error:${colors.reset} Index '${index}' is out of bounds. File has ${blockCount} blocks.`);
          process.exit(1);
        }
        
        const data = docs[2 * index];
        console.log(data);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error printing block data:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('changelog')
    .argument('<file>', 'Path to the yaml-chain file')
    .option('-o, --output <output-file>', 'Save changelog/release notes to a markdown file')
    .option('-w, --owner <owner>', 'Specify GitHub repository owner for attestation verification commands', 'aaronbronow')
    .description('Generate structured markdown release notes / changelog from the YAML chain')
    .action(async (file, options) => {
      const resolvedPath = path.resolve(file);
      try {
        const markdown = await generateReleaseNotes(resolvedPath, options.owner);
        if (options.output) {
          const resolvedOut = path.resolve(options.output);
          await fs.writeFile(resolvedOut, markdown, 'utf8');
          console.log(`\n📝 ${colors.green}${colors.bold}Changelog generated successfully!${colors.reset} Saved to: ${options.output}`);
        } else {
          console.log(markdown);
        }
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error generating changelog:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('verify-asset')
    .argument('<file>', 'Path to the yaml-chain file')
    .argument('<asset>', 'Path to the local build asset to verify')
    .description('Verify if a local build asset matches the cryptographically secured build attestation in the chain')
    .action(async (file, asset) => {
      const resolvedChain = path.resolve(file);
      const resolvedAsset = path.resolve(asset);
      console.log(`🔍 ${colors.bold}Verifying build attestation for asset:${colors.reset} ${path.basename(asset)} ...`);
      try {
        const report = await verifyAsset(resolvedChain, resolvedAsset);
        console.log(`\n✅ ${colors.green}${colors.bold}ATTESTATION PASSED:${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
        console.log(`${colors.bold}Asset Name:${colors.reset}   ${report.assetName}`);
        console.log(`${colors.bold}Chain Block:${colors.reset}  Block ${report.blockIndex}`);
        console.log(`${colors.bold}Builder:${colors.reset}      ${report.builder || 'Unknown'}`);
        console.log(`${colors.bold}Asset Hash:${colors.reset}   ${colors.yellow}${report.actualHash}${colors.reset}`);
        console.log(`${colors.gray}------------------------------------------------------------${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}ATTESTATION FAILED:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('rollover')
    .argument('<file>', 'Path to the yaml-chain file to rollover')
    .requiredOption('-a, --archive <archive-file>', 'Path to save the rolled-over cold archive')
    .description('Rollover a bloated chain to a cold archive and start a new cryptographically linked chain')
    .action(async (file, options) => {
      const resolvedFile = path.resolve(file);
      const resolvedArchive = path.resolve(options.archive);
      console.log(`🔄 ${colors.bold}Rolling over chain:${colors.reset} ${file} ➡️ ${options.archive} ...`);
      try {
        await rolloverChain(resolvedFile, resolvedArchive);
        console.log(`\n✨ ${colors.green}${colors.bold}Success:${colors.reset} Chain rolled over and re-initialized at ${colors.bold}${file}${colors.reset}`);
      } catch (err) {
        console.error(`\n❌ ${colors.red}${colors.bold}Error performing rollover:${colors.reset} ${err.message}`);
        process.exit(1);
      }
    });

  return program;
}
