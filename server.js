
const showroomRoutes = require("./routes/showroomRoutes");
const express = require("express");
const cors = require("cors");
const qrRoutes = require("./routes/qrRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const startExpiryCron = require("./utils/cronJobs");




const dotenv = require("dotenv");
dotenv.config();


const connectDB = require("./config/db");
connectDB();

const app = express();

const QR = require("./models/QrCode");   // path adjust karo agar different ho
const User = require("./models/User");
const BRAND_LOGO_DATA_URI =
  "data:image/png;base64,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GCaBx4FOEW0zEYBkAeGyyy67/fbb3/CGNxw+p/wb3vCGO+644w//8A/n/JM/9rGP/ehHPzr77LMP3/l5wQtecNttt73mNa85kovi+37gp37+859/++23v/GNb5zFhxQKhTk8JM/zlFKf+tSnPvOZzyxZsmSuTLfPfOYzn/rUpw7xc+rEVGqd3gZfqYDTm0z/LwBbgPvm7swz8BOgqbX0gV7gVJFuDazvosZ73/veb3/72+vWrTvcX7RmzZqbb7757/7u75qd3VELHR0dX//619/73vc22wt+Fli2bNlXv/rVt7/97UdMSDHz1NTUK17xiu9+97snnHDCkRGL9eE4zk033XTdddfN+em97rrrPve5z83PC6QF6G9y0m8R+M1cN4t+GJhuRloxUALWi4AXAqiD//f//t/HPvaxuZLIjeCd73zn1772tdi5cSia41e+8pXf+73fO3IbRanPfOYzr3zlK4/M101PT7/2ta/9yle+0tHRMU92y3nnnffmN7/5MH34W9/61o9//OPzkwCWNt+S4f65PozfAqNNFgQUpB5YCKAO3vOe93zgAx848t/7mte85h//8R8PRW1XSn3xi1+87LLLjvCRu677hS984bTTTjsC37VmzZp/+qd/mitPy1xZAId7Q85hyH2usBFob6Y9pwIqh5b7n4tdwP4mLQAFSHhTCCAfV1555V/91V8drW+/6qqrPvGJ2WepfehDH3r1q199VI582bJlN954Yyo/53Cgq6tr/uj+Rwyf+tSnjjvuuHl1SD1AoRkCCKYE75/rw/CBg81n9YgFIASQg/Xr1794442HW6Grj3e+851XXXXVLN64/vnnv+997zuKR37JJZfMLiQrmBF9fX0f+9jH5tUhdTUZfQXgAXM+l0AD0026gDSwVraUEEAWn/zkJ/v7++eDunfiiSc29RYi+vCHPzy7+qwDBw7cd9993/3ud2+55Zb//M//vOuuu3bu3Dm7I3/3u99dKpXk4jkc+L3f+71LL710/hxPs2F0AiaBJw4DAYw0L6207KeZsOhaQbz0pS+98sor54Vx3dPzsY99rKmDufjii1/wghc0+0WbNm36//6//+/HP/7xvn374l40juO0trZeeOGFb3nLWy6//PKmPvD444+/4oorvvKVr8j1M+cgone/+9233XbbMUoAwVv0YTiMiea7whVlPwkBWL/WdT/0oQ/N+u0DAwNBt5zh4WFm7urqOvvss88555z162eZb/aqV73qkksu+clPftLg61/3utc1m7P0iU984gMf+EC2y5vv++Pj49///ve///3vX3fddTfccENTn3zVVVcJAZjWVTCOUWvd3t7e19d3KGGSSy+99FnPetamTZvmw09rnZWX4HDk1TXrsdVAL+A0mcMqBLCQ8YIXvOBZz3rWLN64bdu2T33qU1/96lezLd7a29uvvPLK973vfSeffPIs1L23vvWtDRJAS0vLc5/73KY+//rrr//gBz8448s+/elPn3jiiU2l+Z9//vkbNmx46qmn5vNyb9t2eCcDHjx48Ktf/ep///d//+pXvwomrTOz67qnnnrq+eeff9VVVz3jGc+YjaRznD/6oz+aJwSwBHBnO6BxbjHePK8QBDNhUbWC+NrXvjaLev0f/vCHM+r4/f393/nOd2bx4ePj4w0WOi1ZsmRwcLDxT/7yl7/c+JlZsWLFgQMHmjryZoPY3/zmN/kI4rbbbqsfLGm2FUQK3/zmN0866aQ6n18sFt/73vdOTU3N4sN37NjRVLHIhz/84aY+v/G67qubbAQ0AWw/PPmX7wO4yXZA/yPtgGYS/ovIAli1atWLX/ziZt91xx13XHHFFYF+V9879PrXv/7WW2+96KKLmvr89vb2l7/85Z/+9KdnNmm1bryL78jISFNVDnv37v3BD37QVB76Oeecc/PNNx/hRRweHt6+ffu+ffuGh4dr+ayUUo8//vinPvWpwzfe4JOf/ORf/MVf1H9NpVL5+Mc/vnnz5i9/+cvxDIkGsWbNmksvvfQ73/mOCKkjhra8gAfNNAaZgIJBMwRUm5+cIy6gI4FLL720u7u7qbccOHDg6quvnlH6hybq+PjVV19911139fb2Nntgn/nMZ2bsWzAxMfE3f/M3119//YzSZN++fddee22zDpA77rijKQI4++yzlVJz3te+Fn7yk5986Utf+slPfrJv376jO7jmX//1X2eU/jG+9a1vrV69+rOf/Wyz3/Lc5z73GCWA+eN4aTCC3QV8DHg+4GXe4gLbgT8HHklpk8DFwFnAqUCPUSvnABXgr4FvCgHMN8yiO/9nP/vZLVu2NP76LVu23HjjjR/+8Ieb+pYzzzyztbV1cnJyxld+6lOf+t73vnfWWWcppXIJg4gqlcq99947C/f3jh07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9/+9rf33HNPs+/66Ec/+o53vKORV1555ZV/+Zd/OQvTpH4a6OOPP974p/X09PzxH/9xUwdw2mmn/f3f/71cCU24Jjo6vva1r/3hH/7hjK8844wzZte3dXh4+Oc///m8+tX/CowAszASK4AG/gS4Dfgr4PwaROIC64E3Aj8EvgJsnG1D6RLwH8CQbFMhgBS01v/yL//S9AlS6sYbb7zppps2btxY6zVLly798Ic//LWvfW0WKSK/+c1vNm3aVOcFzcaur7vuuksuuaTBF5955pn/9V//tXLlSrkSmuWAm2+++ZZbbrn44ouzg5dd1924ceOHP/zhO+6445xzzpmdtbp79+559ZPvBb4DtM/u0gPGgDXA/wW+D9wF3AJ8GHhfdLsJ+B/gl8DngYuBMjA9qy8qADuBm2SDNozF1Qzum9/85vvf//7jjjuu2TdeffXVV1555S233HLnnXdu2bLlkUce0Vpv3LjxhBNOOPvss6+88soTTjhhdod000031Xf1Nlt51N7efsstt/zFX/zFv/zLv9TxLBWLxTe/+c0f+chHli1bJpfB7HDFFVe86lWv2rx58wMPPPDww2HfgTVr1pxxxhmnnnpqZ2fnrD/5K1/5yjz8vZ8BXg60ALMLTVSACuAApwBnAFeYdjBQBTxg8tCmuLQC/wpsl60pBFDLsv70pz/9mc98Zhbv7enpufrqq6+++mrf94P0jLa2tkNsF/Hoo4/OWFj0s5/9bO/evU159pcuXfqFL3zhqquuuvnmm2+77baBgYGgqwwRtbS0nHLKKS984Qtf85rXnHXWWXIBHCKI6OSTTz755JPn8DM3b978ve/NxyjmvcDngPcBo4fwIRooz+moFtP58xDwadmUQgB18LnPfe6qq66anWEewHGcuWqZ8J73vGdkZIaetWNjY9/73vfe+MY3NvvhF1544YUXXjg+Pr59+/aRkREiIqKVK1euXLly/rQ5EuRu0dx2rfMBnwBeAJw9/4aeOwAB7wP2ywYSAqhnh1Yq73rXu3784x+77lH+7f/yL//yne98p5FX3nTTTX/4h384O6nd0dEhwyOPIWzevPmf//mf5+3hHQSuizKCKvPpwNqBvwVulQ3UJBZj//c77rjjr//6r4/uMTz44IONlxTdfffd3/72t2WzLgZ84AMfmNEoPLq4E7hunimPLcDXgY/I7hECaBAf+chH/uM//uNoffvevXtf85rXDA01kav2/ve/v6nXC45F3HLLLbfccsv8P86bgb8ESjNyAB2GW40v+UaT/YIEi5oAtNZvetObGvTAzC0GBgYuv/zyOGmkQWzZsuVP//RPD/c5uf/+++fbLMx5gnK5fLgJ+PHHH7/22muPlfP/t0BgwLY0I6znAJlvYQII7yf0yDYVAmgcY2Njv//7v/9f//VfR/JLH3vssZe85CW/+tWvZvHef/u3f5tFoVnj+PjHP/65z31uPgwin4cYGhp6y1veMjY2dpg+f+/eva973euarfk4KiACEUD4FOFNhCFgydGelzINnAN8MKIE2cJCAA1hfHz89a9//Y033nhkvu7WW2994QtfeP/998/6Ez760Y9ef/31h+PYbrrppve///0i/WuhtbX1v/7rv17/+tcfjiEtg4ODl19++SzK1I+83I83SPD/14GXALcBHTO2C507n08uJoC3Ai+pcbQCIYB8TE5OXnvttVdeeWVTHReaxfDw8Ac/+MHLLrtsx45DnVL3wQ9+8JprrplbVfSGG2645pprADQ1EIaImuof12za1eFmo6Y+XynV0dHx3e9+98UvfvHWrVvn1ih8+ctfPjuj0Dy8w/f6XElKgAII+A3wEuDPgF1AJ1BEaB+Er4hvsyaAWh9iwwdc4Aag3y4lExoQApgZ3/zmN5/73OfecMMNzU6OnBGVSuXLX/7y8573vDnU3G+66aaLL754TnrF7Nix46qrrvrzP//z4GFTDmjf95tqV9DsULbZ9bVuHE312tRaBydn06ZNl1xyyTe+8Y05OYZ//ud/fsELXnDoun+zdQNTUw21WM5Kz5T4VYADeITPEC4mXK+wU6Gd0EZwyGCCWd2ozifA5oPgRwGnAB8KdrLNEfVpYEYthmbVBOnYgIyBNXHqqaf+7d/+7Y4dO/iQsXPnzhtvvPHpT3/64aJupa6++uqHHnpodoe3f//+G264ITXl/IwzzhgbG2vwE773ve81pUS/+MUvbuoIX/va1x7WtV61alXjC/2Vr3wlpTVffvnl991336y3x89//vOXvexlc/VbzjzzzNHR0Qa/+rHHHuvp6WnQ4RPflHFzgn8VHAXXCf+FA7hY7eItLv7bxaAL7cJ3MeVivIDRAkaCWzG6U+M2WsB4AZUC/AKm4je6eTcHIw5GVPSvwphChXAZAcbRpn5IFn8U9aKo5N18wDecSwtM+FNXV9c8zzs+8ujt7f2d3/mdl73sZRdccMGaNWsa9914nrdz585f/vKX3/ve9370ox8dOHDgcB9qqVS64oorrrjiiosuumjp0qUzvr5arf7617/+z//8z69//etPPfVU9gWXXHLJn/3Zn61YsaKWAk5ESql77rnnr/7qr5ptWPbqV7/6mmuu6ejoqNOkSCk1NTX11a9+9fOf//zhPntnn332+9///rVr19b5sUT0y1/+8q//+q/3708XmRaLxSuuuCKYALpkyZJGvnH37t233377V7/61R/+8Id1TsIscOmll77rXe/q7e2tYzkppbZt23b99dfXH46U1fpr/TW8T8lrPICBAuEU4PmEZzHOIqw0ggQ+heO9tO2IoKiatwwMA5uB7zGWAO8CKkDaNM1aqtEzJcbjwKWMPbZ/I/0BxuMlwPuAC6KDz+r+3wf+DvAXnKATApgBbW1tp59++plnnrl27drTTz+9v7+/vb09tpk8zxseHp6YmNizZ8+jjz66e/fuBx544KGHHpqcPAoZyWvWrDn//PODCfLr1q3r6uoKulSWy+WRkZEDBw48+uijmzdvvvvuu3/729/O6P1wXbeWOyjQ+mc9qySIHNTxNRGR7/tHMhvy0H/s2rVrn/Oc55x44olnnHHGmjVrlixZ0tnZGajbw8PDY2Njjz/++GOPPfbAAw/ceeedhy+VqP5vCX5O/d9SR/Qn4d/sHfs1RNBAFWCCCywBjiecDvQC64B1wFJAEZZGb2RgGJgE9gBbgB3AvYztwDjgAF8HruSo+xBnxHkeMXQyPge8DSC2fkIdDgDg1u5D5y9Q+SYE0LTXxXGcuCUDM1er1SMsrRqB4ziu6wYRWq2153nzZ7bUYtgkruvGVmO1WvU875jI7q8l/WuJ/qzcT72GAAaY4FGoXCugjVAACChE38KAB/jAFFAGFFAEXIAYZWAD8F3GBmDaFvqc4gC27IkC4yrgGwwFEFuSnWtzwGKDEIBAIMg4dmr8KZUGGsjuODISSPzAHZTcj7xDFL0toARK5eoYnxkGcAOpzRgBXgV8GWCGnxL3JhNw8kYALcAOxouAJwCH0+JeOCAmAKdUKpXLZbkABAKR/shLngkEulK29CdAhak+iqAUFIEUiOCo8GEcgw0fRk+6QQCZ0jcVfxSSsHML4SFCD/A8QgWZPKTo8CwaAXxgJaGN8D0kIYqszypr9ywqlEolV3a/QCDSfwa3D9l6ukqr/MrIsaGUEWCaApSxMLJOekqU+sBrVGL8LeMs4ELGuPEyU+snU7UngFFmPAdoJ4wDKtL0Kfpw0wSJn1yEEAIQCET6zyD9lfGQVJSIT+G/QbZ+QgNRLZjFB8pSw3P07ih1nw2PTeAFKjHGgWsZX2GcAZTZdviYdwwaaAG2MKaDXCAKnUssHCAEIBAI0kxgS/9QIFLicWEj9ktIigPIoAEiy/uvVPJKMnxK4bdw/nGwTowA5vBOB7CN8Uca7wKeztHzcbQgtgl0yBkOYTvwAcDnKL2HwFFAWDggOd8SBBYIFrn6n5vPE0v/UNk3hLuKpT+SkivYVWPxv4S0dwiGOyhrBzASOyAQ9IxQ3E8FZMBgHf0peoHmkAl08AkaE0CZUTQ/BFbcOBsTXmwE0NXVJRaAQLDYnT85zxi6Pyhy+sPS6xP5rgy5H4RwVeIRUplCXDOLlMhw6XMijmPdP5TpDGa0MTRjmsEUPq81GGANpuh+8CcFaJQo+TQFaICDgAGBOccOWIRGgBCAQCDOH4sGTFcPzIdRJk9gE4RpP8FbjMyfgBWUivJ5DMJA/ND4Yit+G6nqpgUQE0Bwx9HQwZ80fApVfmawil4WfIJCWGpNUArMoFSQGcIBQgACgTh/YEn5lPRXuY6dyO0Tp3gGKn+cD+oo+y2p/kJIZwSZBACGttX/mAN8DUWh7q8VKLpjqv+sg3AASIEYPod2hhkHxqKvAhMCEAgEtvPHzPRXiUGQagkXPoyz+1Uo4h3HyOWP7mS9Rmbyfi4BxH7/RPRraIaO/DaaoQk+Q2sQQXFoCgQqv0PQBNJwCDqwGBiKoONCMyQZR4vcCBACEAgWu/oPO99fRSaA6cdPwrzKKP4yBH1S/xUViAXPULYrp8EuQDr9P47ZIpL+fhT19TWUgtbQDD+W+zo0F4LOP74GOYAGKejA7aOgIg4wI8xE6cRQsQAEAsFi5QMzWdOM+pIV46VY3FPi7Ymlv0NwnOh+5A5SZkqoiggmE4hOCABGSg/D0WAV6vKB1u9rEIE1iOATKOovSg5A0DrR9wPCgAJpY0oAJyVjZPiCFqERIAQgECxKuZ/iAErfD6QnGc0eiOxOD5HcjwnAoeSZ4KFywrcknwNARXaAeSicNPgJHD6xC0gH8V4GaygNX0H5UJGfh4I7FFoDUCDAB5SOrAsFZiBgAgZTaBNwlBQEKQQTCASLSt9PtH6zvAuWlyabx5lo+oGId8I7QXsf5YRkkJCEA8fuBZRbGIzYFcRJJo/WSeDXZygNraE0HA2PoAI7wAcx/OjwfE46/wQcoAGFMHigFHw/jD8Hol8BuoYRIAQgEAgWvvofPyaEk1nCWbyZwi5T+puCPpwLRiEfJC6giA9ic4HsAjFzkkwAzVaFl6/Tnh8/oAEfXpxi5IMAP2gb5AI+NIGVxQEUuICifFDNVjIo8tw+i8QmEAIQzBkcxymVStne98uXL29paZnbnvhEVC6XBwcHs89PT08f7nnCC8waSJI+owiw6fdXKiP9HYsDXCd8xnUsyyB4pWuGi1XapIBZBxAl/4Spn0Hmjw8f0H4o/X0NT4fOH98Hgvli0UcEP8QDQs3f8AUFLqAwNsAhGWidJKQuTiNACEDQHEqlUiDlmbmnp6e7uzsYbai17u7ujh+aaGtrSw3UnRNorbPD15RSw8PDw8PDwTcGD4eGhoLhjtPT083OT1/A/p/ECxRJvqSxj4KC0c85iuWGgt5U/B24BgcE/xYcKAeuSgyCeIxwigDYLgQz1X8dKP4ONMN34Pnw/dAL5BPIBxHIh0+ABwJIJ6O7PAqrAUwO4IBv2Mr/AWMx1wMIAQhqorOzs6WlRWtdKpX6+/sBBEK/vb09kPKFQiGYO4bw6mWtdXZSvO/7h0klD8ZemmDm/v7+lStXmt9erVYDMpiYmAjIAMDAwMD09DQRjYyMBC9YhP6fVApQkvZjVwCEXh2k3T7xRHjXTUR//HxAFY4T1gfEWaFJuwhb9LKRAxoEAHTk8/E0HAVPWf4fT0MRyA+7O4SquxN9FkETmMIMIuKwgkypMKk0LgejaEYNIK0gBIsVSqmenh7HcTo6OlasWBHI+mKxqLUOxhzGejczx3I/O2zySI4/zJ2rniIbIoqneHZ1dS1dujS4v27duoCuhoeHp6enlVJ79+4dHx/3fX9oaGhuJ7bPW2sgO+0r5fenyInvUJLwEwt9N3L7BHcKDpzoXzeyDBKPUBwHdqIPZ8so0QA4Ev2A9qGDCLAPR8PXcBx4HkhFN98gMx+Jwm/QCQUJP0GhsgYrQENRWDOMyNefnVC2SOoDhAAWLwJZ39HR0d3d3dvbC6C7u9t1XSIK/CemrD92pwqbhBTYKDExBD9t2bJlgU2wcuVKZvY8b3h4GMCBAweGh4fHx8cDVliwRoBdAaDsAS9mJqgTRXpdZUh/B4WADBwUHBRcww5w4TpQlMQGlANF0Aqaojb9xqEoBjMUw4mqfwPp76vQ9e9oOATHjwjJ7F0RmALJQsNB2BY0Vu2ZoDhM+4mLwpCaFbPI0oCEABaZxee6PT09HR0dS5cu7erqam1tLZVKgTSMFWqt9YLXf01iMIU7Ebmuu3z5cgB9fX0Apqenp6amRkZGDh48OD4+PjQ0dIxyIVE9/0+q7Q8ZQxlDt4+TZPcHOT+h9HdDcV9wjfuR9Hcid5By4Cm0KrQQVhGtJvJrMJMHPKx1BRjVcDQKPnwNLzAC/MSM8OxIMvxoMAAnd1hFsWWCo4BI+geWR5AemooE2KNlhAAECwItLS3Lli3r7e1dvnx5W1tbsVjMasSCmBVMSiiVSq2trT09Pccdd1ylUpmcnBwcHDxw4MD+/fuP3WHabA9wN71Acb0uUbrTQ5LzE//rhlq/66Joc0BsEzguoNClcKpS64CVoAJQqi1kGXimcqrAZsXbmbc6rDRcH56PqpmQ6hnzJqN3mvPhg3BAqPhHxWKh4yiiAdiu/9gdhEXDAUIACxmlUmn16tU9PT29vb2tra2u6wZeHcmSbBwmQbquG0QRPM+bmpo6cODA0NDQrl27jqHMIrZnqieiP27RnNfrLY79xkp9IOJN3b/owHVRdOFGNFBwwQ6UwimKXgjVAfihpo6pugdZBIrAs0DPJNrs8I+VHlUoOnAUqj6UQtUzJsCTJfph95JzosYSisAKrMMgcCz92fb9E6QdtOAYh+M4/f39/f39PT09XV1dRBTI/WPXjz9/7IM406m9vX3JkiXr16/fuHHj0NDQwMDAwMDAfGZWNsp9Yfv9EQ11CVI/AyMgTtoJ3fcqDOQ6UWKPG0v/wPtfQNEN7wQ2gefgREXngdaDGGicJAPKnQYIOAm0ipzfOnyP0lMKykuOMNbftVFAgDiVSEWthABWII6qwKL3qsg7xGx5gTiaMr8YiEAIYKG5elatWrVu3bre3l7HcbTWouwfViYA0NnZ2d3dvX79+gMHDmzfvn337t3z0zWUbf6T6v6fLf2lqCbAITgU5nQGiT1hyDdW/10UA8W/gBYHqoBWB88k9UxQCajMVpgyUAVageeD+kj9t9ITBRQDv381eU26hkCF1QNO1E0ocGchaiqnfHDcN8LOB9VshQEWfCKQUyqVjl1XpiBGa2vr8ccff+aZZ27YsKG9vT0QTywzL44IGQQ2QUdHx8qVK/v7+wuFwuTk5Hyzt1KDGK1Ir9nhOWjg4xjpnrHKrwznT+DqKaDoolgIpX+xgJYCnCKKDl5B6lyQH9TlHrLtUgX6QE8jNUzYRyhEsyTZcP2w6QgyZ8obs+PjemOkRtCYzywalEolIYCFgDVr1px11lkbN24M6rZE7h9Fs6C1tXXlypW9vb3VanV0dHReEQCZ6j8l/T5DD0/AB47RztMu9QoLvly4ThTydSLpX0CxgFIBjouig8tInQSamlORqoEicCJoiLCfLN9FOBY4vm80lI4HyseJ/8GLEZOHSSRReHyRhIKFAI55LF269GlPe9rpp5/e1tbmeZ6I/nliELS3t69evbqjo2NqamqehIitdv+Z4Y5Jdk3K6W+k/biG379YCP8tRg9LBbgFFCLpfzh+swYc4CTQEOEAhZn+oXyH0UrIdAcBCJ7RYaggflnQD86cP2wsolgAgvkNx3HWrl37zGc+s6+vb2Fk7pOBBUADAHp6evr7+8vl8vj4+FHn5hQBKLvDc1jzpZIBL45K3P1Bp4fAHRTnesZun0D9LxagXFxG6uTDI/1jZd8FNoAeAnsUzv615kfG0l9bzwfKfDg6OKINy2JAYiJg0RCABIGP1ZU755xzgv4888/XTFmx3pB+Z3CY2WKo8XfhyDaimJEDPM8rlUrnnnvu2rVr77333qNoCoRxzqDfc2r8S+gIMaK+xp148pcTDXhRcZMfwywoKMDBSUQnghpSJwO1XUcZPwCCMWQq26s6DQ9oBV5I6jtKuw4KGlrDd5J+0Y4DpUEOFIes5nA4QT4oCIjHAMQ/3CwDCwcG2IOCFyqEAA71ojqcEiT/+Y6OjvPOO6+3t9f3/aMi70yBrpQyH6ZsESIKymjrcwARVSqVnTt3Bu9VSq1Zs6ZYLNb/dcxcLBa7u7vNJ5VSZufRVKXbkT9dQXx41apVLS0td9999/j4+NFhoyjVJ1UHYNoEKeNAxQ1B43IwJxH9cRpoUAysXHQSXgClZ5SYDPZBCqodqodVO1AANHga/gj0MHElYoK6HHAS6CSixxwuMHwfvgNfww1qhiMLRkceraARdDjSkqM+dEY/ojodgRY2hADmhaxv5EsD2dXd3X3eeed1dXUdMcU/lt2xrA+6ewaq/dDQ0NjYWCBzg8Zq+/fvj98SdGCeRSx0165dDW1f1126dCkRBZKdmZctW9bd3R081FovWbKkq6srCM86jpNqaXdkKCEwBXp7e88///y77747aDR0pDdYoPByQgYxMSiyiqosO0AZRWGpYQDGDADXgefgaaSWzJjs7wOEwnp2N7K7nFEEOYCKrAEPegzeDlXdSnoU5Na0BhjQwAugdpM/FhxA0CnIh+PA0SEB+AF76SjTSUc1BEYelEmEkIlggmavyazWMDsFrREsX973zGeeed1d…";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/showrooms", showroomRoutes);
app.use("/api/mechanics", require("./routes/mechanicRoutes"));
app.use("/api/drivers", require("./routes/driverRoutes"));
app.use("/api/qr", require("./routes/qrRoutes"));
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/service-notes", require("./routes/serviceNoteRoutes"));
app.use("/api/payment", require("./routes/payment"));

app.use("/api/salesperson", require("./routes/salesPersonRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/leads", require("./routes/leadRoutes"));
app.use("/api/customer-leads", require("./routes/customerLeadRoutes"));
app.use("/api/support", require("./routes/supportRoutes"));
require("./utils/reminderCron");


app.get("/", (req, res) => {
  res.send("ParkingQR API Running...");
});

app.get("/scan/:qrId", async (req, res) => {
  try {
    const qrIdParam = req.params.qrId;

    const qr = await QR.findOne({ qrId: qrIdParam })
      .populate("assignedTo")
      .populate("showroom");

    if (!qr) {
      return res.send("QR NOT FOUND");
    }

    if (qr.qrStatus !== "activated" || !qr.assignedTo) {
      return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>CarbiQR</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .status-card {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 24px;
            box-shadow: 0 20px 48px rgba(15, 23, 42, 0.12);
            padding: 32px 24px;
            text-align: center;
          }

          .status-badge {
            width: 64px;
            height: 64px;
            margin: 0 auto 18px;
            border-radius: 20px;
            background: #fff7ed;
            color: #ea580c;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            font-weight: 800;
          }

          .status-brand {
            margin: 0 0 8px;
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
          }

          .status-title {
            margin: 0 0 10px;
            font-size: 24px;
            font-weight: 800;
            color: #111827;
          }

          .status-text {
            margin: 0;
            font-size: 15px;
            line-height: 24px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="status-card">
          <div class="status-badge">!</div>
          <h1 class="status-brand">CarbiQR</h1>
          <h2 class="status-title">QR Not Activated Yet</h2>
          <p class="status-text">
            This QR has not been activated yet. Please contact the showroom or vehicle owner for activation support.
          </p>
        </div>
      </body>
      </html>
    `);
    }
    const user = qr.assignedTo;

    let maskedNumber = "Not Available";

    if (user.mobile && user.mobile.length >= 10) {
      maskedNumber =
        user.mobile.substring(0, 2) +
        "XXXXXX" +
        user.mobile.substring(user.mobile.length - 2);
    }

    return res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>carbiQR</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
      background: #f4f6f9;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    .container {
      width: 95%;
      max-width: 420px;
    }

    .card {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.08);
      text-align: center;
    }

    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 16px;
    }

    .brand-logo {
      width: 62px;
      height: 62px;
      object-fit: contain;
      border-radius: 18px;
      margin-bottom: 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.08);
      background: #fff;
    }

    .brand-name {
      font-size: 22px;
      font-weight: 800;
      color: #111;
      letter-spacing: 0.2px;
    }

    .brand-subtitle {
      margin-top: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    .icon {
      font-size: 40px;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0 0 20px 0;
      font-weight: 600;
    }

    .info {
      margin-bottom: 12px;
      font-size: 15px;
      color: #444;
    }

    .label {
      font-weight: 600;
      color: #111;
    }

    .button {
      width: 100%;
      padding: 14px;
      margin-top: 14px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    .move-btn {
      background: #111;
      color: white;
    }

      .tow-btn {
  background: #B91C1C;
  color: white;
}

    .call-btn {
      background: #16a34a;
      color: white;
    }

    .footer {
      margin-top: 18px;
      font-size: 13px;
      color: #777;
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="card">
      <div class="brand">
        
        <div class="brand-name">CarbiQR</div>
        <div class="brand-subtitle">Vehicle Assistance</div>
      </div>
      <div class="icon">🚗</div>
      <h2>Vehicle Details</h2>

      <div class="info">
        <span class="label">Vehicle Number:</span><br>
        ${qr.vehicleNumber || "NEW VEHICLE"}
      </div>

      <div class="info">
        <span class="label">Showroom:</span><br>
        ${qr.showroom?.name || "N/A"}
      </div>

      <div class="info">
        <span class="label">Owner Contact:</span><br>
        ${maskedNumber}
      </div>

      <form id="moveForm">
          <button type="submit" class="button move-btn">
            🔔 Request Owner to Move
          </button>
        </form>

        <form id="towForm">
          <button type="submit" class="button tow-btn">
            🚨 Towing Your Vehicle
          </button>
        </form>

        <script>
            let cachedLat = null;
            let cachedLng = null;
            let cachedAccuracy = null;

            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                function(position) {
                  cachedLat = position.coords.latitude;
                  cachedLng = position.coords.longitude;
                  cachedAccuracy = position.coords.accuracy;
                },
                function() {
                  cachedLat = null;
                  cachedLng = null;
                  cachedAccuracy = null;
                },
                {
                  enableHighAccuracy: true,
                  timeout: 15000,
                  maximumAge: 0
                }
              );
            }

            function sendRequest(type) {
              fetch("/api/qr/move-request", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  qrId: "${qr.qrId}",
                  type: type,
                  latitude: cachedLat,
                  longitude: cachedLng,
                  accuracy: cachedAccuracy
                })
              })
              .then(async (response) => {
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                  document.body.innerHTML =
                    "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                    "<h2>Please Wait</h2>" +
                    "<p>" + (data.message || "A request was already sent recently. Please wait 2 minutes before sending another request.") + "</p>" +
                    "</div>";
                  return;
                }

                document.body.innerHTML =
                  "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                  "<h2>Request Sent</h2>" +
                  "<p>" + (data.message || "The vehicle owner has been notified.") + "</p>" +
                  "</div>";
              })
              .catch(() => {
                document.body.innerHTML =
                  "<div style='text-align:center;padding:40px;font-family:Arial'>" +
                  "<h2>Error</h2>" +
                  "<p>Something went wrong. Please try again.</p>" +
                  "</div>";
              });
            }

            document.getElementById("moveForm").addEventListener("submit", function(e) {
              e.preventDefault();
              sendRequest("move");
            });

            document.getElementById("towForm").addEventListener("submit", function(e) {
              e.preventDefault();
              sendRequest("tow");
            });
            </script>

      <button class="button call-btn" onclick="callOwner()">
        📞 Call Owner
      </button>

      <div class="footer">
        Please contact politely if the vehicle needs to be moved.
      </div>
    </div>
  </div>

  <script>
    function sendMoveRequest() {
      fetch("/api/qr/move-request/${qr.qrId}", {
        method: "POST"
      })
      .then(() => alert("Move request sent successfully"))
      .catch(() => alert("Something went wrong"));
    }

   
  </script>

  <script>
  function callOwner() {
    const caller = prompt("Enter your mobile number (with +91) to connect call:");

    if (!caller) return;

    fetch("/api/qr/call/${qr.qrId}", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ callerNumber: caller })
    })
    .then(res => res.json())
    .then(data => alert("Call connecting..."))
    .catch(() => alert("Call failed"));
  }
</script>

</body>
</html>
`);

  } catch (error) {
    console.log("SCAN ERROR:", error);
    return res.send("SERVER ERROR");
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryCron();   // 🔥 add this
});
console.log("Razorpay Key:", process.env.RAZORPAY_KEY_ID);


