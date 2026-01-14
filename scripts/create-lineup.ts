import { writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { stringify } from 'yaml';

const readline = createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query: string): Promise<string> {
    return new Promise((resolve) => {
        readline.question(query, resolve);
    });
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

async function main(): Promise<void> {
    const displayName = await question('Display name: ');
    const slug = await question('Slug: ');

    let region: string;
    while (true) {
        region = await question('Region (am/ap/eu/me): ');
        if (['am', 'ap', 'eu', 'me'].includes(region.toLowerCase())) {
            region = region.toLowerCase();
            break;
        }
        console.log('Invalid region. Please choose from: am, ap, eu, me');
    }

    const yearInput = await question('Year: ');
    const year = parseInt(yearInput, 10);

    const numDaysInput = await question('Number of days: ');
    const numDays = parseInt(numDaysInput, 10);

    const days: any[] = [];

    if (numDays === 0) {
        const startDateInput = await question('Start date (YYYY-MM-DD): ');
        days.push({
            number: 0,
            date: startDateInput,
            display_name: 'Full Festival',
            artists: [
                { name: 'ARTIST NAME' }
            ]
        });
    } else if (numDays === 1) {
        const startDateInput = await question('Start date (YYYY-MM-DD): ');
        days.push({
            number: 1,
            date: startDateInput,
            display_name: 'Single Day',
            artists: [
                { name: 'ARTIST NAME' }
            ]
        });
    } else {
        const startDateInput = await question('Start date (YYYY-MM-DD): ');
        const startDate = parseDate(startDateInput);

        for (let i = 0; i < numDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + i);

            days.push({
                number: i + 1,
                date: formatDate(currentDate),
                display_name: `Day ${i + 1}`,
                artists: [
                    { name: 'ARTIST NAME' }
                ]
            });
        }
    }

    const lineup = {
        display_name: displayName,
        slug,
        region,
        year,
        days
    };

    const yamlContent = stringify(lineup, {
        lineWidth: 0,
        defaultKeyType: 'PLAIN',
        defaultStringType: 'PLAIN'
    });

    const filename = `lineups/${slug}_${year}.yaml`;
    writeFileSync(filename, yamlContent, 'utf-8');

    console.log(`\nLineup file created: ${filename}`);
    readline.close();
}

main().catch((error) => {
    console.error('Error:', error);
    readline.close();
    process.exit(1);
});
