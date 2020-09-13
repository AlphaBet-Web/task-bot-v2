import { MessageEmbed } from 'discord.js'
import stripAnsi from 'strip-ansi';

import CompilerCommand from './utils/CompilerCommand';
import CompilerCommandMessage from './utils/CompilerCommandMessage'
import CompilerClient from '../CompilerClient'
import { WandboxSetup } from '../utils/apis/Wandbox';
import SupportServer from './../SupportServer'
import CompilationParser from './utils/CompilationParser'

export default class CompileCommand extends CompilerCommand {
    /**
     *  Creates the compile command
     * 
     * @param {CompilerClient} client
     */    
    constructor(client) {
        super(client, {
            name: 'compile',
            description: 'Compiles a script \nNote: This command\'s code input MUST be encapsulated in codeblocks',
            developerOnly: false
        });
    }

    /**
     * Function which is executed when the command is requested by a user
     *
     * @param {CompilerCommandMessage} msg
     */
    async run(msg) {
        const args = msg.getArgs();
		
		if (args.length < 1) {
			return await this.help(msg);
		}
		
        let parser = new CompilationParser(msg);
        const argsData = parser.parseArguments();
        
        const lang = argsData.lang;

        if (!this.client.wandbox.isValidCompiler(lang) && !this.client.wandbox.has(lang)) {
            msg.replyFail(`You must input a valid language or compiler \n\n Usage: ${this.client.prefix}compile <language/compiler> \`\`\`<code>\`\`\``);
            return;
        }

        let code = null;
        // URL request needed to retrieve code
        if (argsData.fileInput.length > 0) {
            try {
                code = await CompilationParser.getCodeFromURL(argsData.fileInput);
            }
            catch (e) {
                msg.replyFail(`Could not retrieve code from url \n ${e.message}`);
                return;
            }
        }
        // Standard ``` <code> ``` request
        else {
            code = parser.getCodeBlockFromText();
            if (code) {
                code = CompilationParser.cleanLanguageSpecifier(code);
            }
            else {
                msg.replyFail('You must attach codeblocks containing code to your message');
                return;
            }
            const stdinblock = parser.getStdinBlockFromText();
            if (stdinblock) {
                argsData.stdin = stdinblock;
            }
        }

        let setup = new WandboxSetup(code, lang, argsData.stdin, true, argsData.options, this.client.wandbox);
        setup.fix(this.client.fixer); // can we recover a failed compilation?

        /**
         * To prevent errors removing a reaction that doesn't exist, we need
         * to save whether or not the reaction was actually successful
         */
        let reactionSuccess = false;

        if (this.client.loading_emote)
        {
            try {
                // await msg.message.react(await this.client.getEmojiFromShard(this.client.loading_emote));
                await msg.message.react('⏳');
                reactionSuccess = true;
            }
            catch (e) {
                await msg.message.react('‼');
                // msg.replyFail(`Failed to react to message, am I missing permissions?\n${e}`);
            }    
        }

        let json = null;
        try {
            json = await setup.compile();
        }
        catch (e) {
            msg.replyFail(`Wandbox request failure \n ${e.message} \nPlease try again later`);
            this.removeLoadingReact(msg);
            return;
        }
        if (!json) {
            msg.replyFail(`Invalid Wandbox response \nPlease try again later`);
            this.removeLoadingReact(msg);
            return;
        }

        //remove our react
        if (reactionSuccess && this.client.loading_emote) {
            this.removeLoadingReact(msg);
            console.log('Reaction removed');
        }

        SupportServer.postCompilation(code, lang, json.url, msg.message.author, msg.message.guild, json.status == 0, json.compiler_message, this.client.compile_log, this.client.token);

        let embed = CompileCommand.buildResponseEmbed(msg, json);
        let responsemsg = await msg.dispatch('', embed);
        console.log(responsemsg.message);
        if (this.client.shouldTrackStats())
            this.client.stats.compilationExecuted(lang, embed.color == 0xFF0000);

        try {
            if (this.client.finished_emote) {
                // responsemsg.react((embed.color == 0x660404)?'❌': '⌛');
                console.log((embed.color == 0x660404)?'❌': '⌛')
            }
            else {
                // responsemsg.react((embed.color == 0x660404)?'❌': '✅');
                console.log((embed.color == 0x660404)?'❌': '✅')
            }
        }
        catch (error) {
            msg.replyFail(`Unable to react to message, am I missing permissions?\n${error}`);
            return;
        }
    }

    /**
     * Removes the loading react from the user's compilation request.
     * Outputs an error to the channel if an error occured.
     * 
     * @param {CompilerCommandMessage} msg message to remove our reaction from
     */
    async removeLoadingReact(msg) {
        try {
            // await msg.message.reactions.resolve(this.client.loading_emote).users.remove(this.client.user);
            await msg.message.reactions.removeAll();
        }
        catch (error) {
            msg.replyFail(`Unable to remove reactions, am I missing permissions?\n${error}`);
        }
    }
    /**
     * Builds a compilation response embed
     * 
     * @param {CompilerCommandMessage} msg 
     * @param {*} json 
     */
    static buildResponseEmbed(msg, json) {
        const embed = new MessageEmbed()
        .setTitle('Compilation Results')
        .setFooter("Requested by: " + msg.message.author.tag + " || Powered by wandbox.org")

        if (json.status) {
            if (json.status != 0) {
                embed.setColor((0x660404));
            }
            else {
                embed.setColor(0x046604);
                embed.addField('Status Code', `Finished with exit code: ${json.status}`);    
            }
        }

        if (json.signal) {
            embed.addField('Signal', `\`\`\`${json.signal}\`\`\``);
        }

        if (json.url) {
            embed.addField('URL', `[Click me](${json.url})`);
        }

        if (json.compiler_message) {
            if (json.compiler_message.length >= 1017) {
                json.compiler_message = json.compiler_message.substring(0, 1016);
            }
            /**
             * Certain compiler outputs use unicode control characters that
             * make the user experience look nice (colors, etc). This ruins
             * the look of the compiler messages in discord, so we strip them
             * out with stripAnsi()
             */
            json.compiler_message = stripAnsi(json.compiler_message);
            embed.addField('Compiler Output', `\`\`\`${json.compiler_message}\n\`\`\`\n`);
        }

        if (json.program_message) {
            /**
             * Annoyingly, people can print '`' chars and ruin the formatting of our
             * program output. To counteract this, we can place a unicode zero-width
             * character to escape it.
             */
            json.program_message = json.program_message.replace(/`/g, "\u200B"+'`');

            if (json.program_message.length >= 1016) {
                json.program_message = json.program_message.substring(0, 1015);
            }

            json.program_message = stripAnsi(json.program_message);

            embed.addField('Program Output', `\`\`\`\n${json.program_message}\n\`\`\``);
        }
        return embed; 
    }

    /**
     * Displays the help information for the given command
     *
     * @param {CompilerCommandMessage} message
     */
    async help(message) {
        const embed = new MessageEmbed()
            .setTitle('Command Usage')
            .setDescription(`*${this.description}*`)
            .setColor(0x046604)
            .addField('Standard compile', `${this.toString()} <language|compiler> \\\`\\\`\\\`<code>\\\`\\\`\\\``)
            .addField('Compile w/ options', `${this.toString()} <language|compiler> <options> \\\`\\\`\\\`<code>\\\`\\\`\\\``)
            .addField('Compile w/ stdin', `${this.toString()} <language|compiler> | <stdin> \\\`\\\`\\\`<code>\\\`\\\`\\\``)
            .addField('Compile w/ url code', `${this.toString()} <language|compiler> < http://online.file/url`)
            .setThumbnail('https://imgur.com/TNzxfMB.png')
            .setFooter(`Requested by: ${message.message.author.tag}`)
        return await message.dispatch('', embed);
    }

}
