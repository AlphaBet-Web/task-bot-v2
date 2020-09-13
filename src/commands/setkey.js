import { MessageEmbed } from 'discord.js'

import CompilerCommand from './utils/CompilerCommand'
import CompilerCommandMessage from './utils/CompilerCommandMessage'
import CompilerClient from '../CompilerClient'
import * as axios from 'axios';
import * as fs from 'fs';


export default class SetkeyCommand extends CompilerCommand {
    /**
     *  Creates the help command
     * 
     * @param {CompilerClient} client
     */
    constructor(client) {
      super(client, {
        name: 'setkey',
        description: 'Sets the key for the tester',
        developerOnly: false
      });
      this.client = client;
    }

    /**
     * Function which is executed when the command is requested by a user
     *
     * @param {CompilerCommandMessage} msg
     */
    async run(msg) {
        let args = msg.getArgs();
        const key = args[0];
        //validator
        if (!key) {
          console.log('Invalid arguement');
        } else {
          //set key to database
          axios.delete('https://alpha-test-bot.firebaseio.com/key.json').then((response) => {
            if (response.data === null) {
              axios.post('https://alpha-test-bot.firebaseio.com/key.json', JSON.stringify(key)).then(response => {
                const setkey = {...response.data, value: key};
                fs.writeFile("key.json", JSON.stringify(setkey), (err) => { 
                  if (err) 
                    console.log(err); 
                });
                msg.message.react('⚙');
                msg.message.channel.send('Key is set to ' + key);
              }).catch(e => console.log(e.data));
            }
          });
        }
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
            .setColor(0x00FF00)
            .addField('Command-based help', `${this.toString()} <command name>`)
            .setThumbnail('https://imgur.com/TNzxfMB.png')
            .setFooter(`Requested by: ${message.message.author.tag}`)
        return await message.dispatch('', embed);
    }
}
